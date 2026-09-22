#!/usr/bin/env python3
"""从 PDF 抽取文本、表格、内嵌图片，或把页面渲染成图片。

四种模式对应模型读 PDF 的通路：
  diagnose —— 先判别该走哪条通路（有文字层？文字是否可疑？），不要凭感觉猜
  text     —— 抽取每页文字（文本型 PDF 才有内容；扫描件会得到空串）
  table    —— 抽取表格为行列表，可直接落 Excel 或转文档
  image    —— 把每页渲染成 PNG，交给支持图片的模型直接看（扫描件、乱码件的通路）
  embed    —— 抽取 PDF 内嵌的位图对象（照片、扫描图、图表）

JSON 报告写到标准输出；非 ASCII 一律转义，避免控制台编码问题。

用法：
  python pdf_tool.py diagnose <input.pdf>
  python pdf_tool.py text   <input.pdf> [--pages 1,3-5] [--out report.json]
  python pdf_tool.py table  <input.pdf> [--pages 1,3-5] [--max-rows 50]
  python pdf_tool.py image  <input.pdf> --outdir <dir> [--scale 2] [--pages 1,3-5]
  python pdf_tool.py embed  <input.pdf> --outdir <dir>
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def parse_pages(spec: str | None, total: int) -> list[int]:
    """把 `1,3-5` 解析成 0 基页码列表；未指定时返回全部页。

    :param spec: 页码表达式，None 表示全部。
    :param total: 文档总页数。
    :returns: 升序去重的 0 基页码。
    """
    if spec is None:
        return list(range(total))
    pages: set[int] = set()
    for part in spec.split(','):
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            start, _, end = part.partition('-')
            pages.update(range(int(start) - 1, int(end)))
        else:
            pages.add(int(part) - 1)
    return sorted(page for page in pages if 0 <= page < total)


def run_text(path: Path, pages_spec: str | None) -> dict:
    """用 pypdfium2 抽取指定页的文字。"""
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(path)
    try:
        total = len(document)
        pages = []
        for index in parse_pages(pages_spec, total):
            page = document[index]
            try:
                text = page.get_textpage().get_text_range() or ''
            finally:
                page.close()
            pages.append({'page': index + 1, 'chars': len(text), 'text': text})
        return {
            'mode': 'text',
            'pages_total': total,
            'pages_read': len(pages),
            'chars_total': sum(entry['chars'] for entry in pages),
            'pages': pages,
        }
    finally:
        document.close()


def run_image(path: Path, outdir: Path, scale: float, pages_spec: str | None) -> dict:
    """用 pypdfium2 把页面渲染成 PNG，供模型按图片读取。"""
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(path)
    try:
        total = len(document)
        outdir.mkdir(parents=True, exist_ok=True)
        rendered = []
        for index in parse_pages(pages_spec, total):
            bitmap = document[index].render(scale=scale)
            try:
                image = bitmap.to_pil()
                try:
                    name = f'page-{index + 1:03d}.png'
                    image.save(outdir / name)
                    rendered.append({
                        'page': index + 1,
                        'file': str(outdir / name),
                        'width': image.width,
                        'height': image.height,
                    })
                finally:
                    image.close()
            finally:
                bitmap.close()
        return {'mode': 'image', 'pages_total': total, 'pages_written': len(rendered), 'pages': rendered}
    finally:
        document.close()


def run_embed(path: Path, outdir: Path) -> dict:
    """用 pypdf 抽取 PDF 内嵌的位图对象。"""
    from pypdf import PdfReader

    reader = PdfReader(path)
    outdir.mkdir(parents=True, exist_ok=True)
    found = []
    for page_number, page in enumerate(reader.pages, start=1):
        for order, image in enumerate(page.images):
            suffix = Path(image.name).suffix or '.bin'
            name = f'embedded-p{page_number:03d}-{order:02d}{suffix}'
            (outdir / name).write_bytes(image.data)
            found.append({
                'page': page_number,
                'file': str(outdir / name),
                'bytes': len(image.data),
                'source_name': image.name,
            })
    return {'mode': 'embed', 'pages_total': len(reader.pages), 'images_found': len(found), 'images': found}


def text_quality(text: str) -> dict:
    """判断一段抽取文本是否"可用"，用于识别乱码与反复制型 PDF。

    乱码成因是字体子集没有 ToUnicode 映射，抽出来落在私用区或控制区；
    也有文档把字形映射到拉丁字母，得到看似正常实则无意义的字流。
    这里只用字符分布做启发式，不做语言模型判断，因此结论是"可疑"而非"确定"。

    :param text: 单页抽取文本。
    :returns: 字符分类计数与可疑标记。
    """
    letters = controls = private = replacement = symbols = 0
    for char in text:
        code = ord(char)
        if char == '\ufffd':
            replacement += 1
        elif 0xE000 <= code <= 0xF8FF or 0xF0000 <= code <= 0x10FFFD:
            private += 1
        elif code < 0x20 and char not in '\t\r\n':
            controls += 1
        elif char.isalpha():
            letters += 1
        elif not char.isspace() and not char.isdigit():
            symbols += 1
    meaningful = letters + symbols
    total = len(text)
    ratio = (private + controls + replacement) / total if total > 0 else 0.0
    return {
        'chars': total,
        'letters': letters,
        'symbols': symbols,
        'private_use': private,
        'control': controls,
        'replacement': replacement,
        'suspect_ratio': round(ratio, 4),
        'suspect': total > 0 and (ratio > 0.05 or meaningful / total < 0.3),
    }


def run_diagnose(path: Path) -> dict:
    """先判别 PDF 该走哪条通路：直接抽文本，还是必须渲染成图。

    这是给模型的第一步调用——不要凭感觉猜，先让诊断给出结论。

    :param path: 输入 PDF。
    :returns: 每页的文本质量、表格线索与建议通路。
    """
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(path)
    try:
        total = len(document)
        pages = []
        for index in range(total):
            page = document[index]
            try:
                text = page.get_textpage().get_text_range() or ''
            finally:
                page.close()
            quality = text_quality(text)
            pages.append({'page': index + 1, **quality, 'sample': text[:120]})
        with_text = [p for p in pages if p['chars'] >= 20]
        suspect = [p for p in pages if p['suspect']]
        if not with_text:
            verdict = 'image-only'
            advice = '没有文字层（扫描件）。用 image 模式渲染成 PNG，再由模型看图。'
        elif len(suspect) >= max(1, len(with_text) // 2):
            verdict = 'text-suspect'
            advice = ('多数页的文字层可疑（私用区/控制字符占比高，或几乎没有实义字符），'
                      '常见于字体子集缺 ToUnicode 映射的反复制 PDF。改用 image 模式让模型看图，'
                      '需要可复制文字时才考虑 OCR。')
        else:
            verdict = 'text-usable'
            advice = '文字层可用，先用 text 模式；需要表格时再跑 table 模式。'
        return {
            'mode': 'diagnose',
            'pages_total': total,
            'pages_with_text': len(with_text),
            'pages_suspect': len(suspect),
            'verdict': verdict,
            'advice': advice,
            'pages': pages,
        }
    finally:
        document.close()


def run_table(path: Path, pages_spec: str | None, max_rows: int) -> dict:
    """用 pdfplumber 抽取表格，按行输出，便于直接落表或转 Excel。

    :param path: 输入 PDF。
    :param pages_spec: 页码表达式，None 表示全部。
    :param max_rows: 每张表最多返回的行数，避免一次灌满上下文。
    :returns: 每页的表格列表。
    """
    import pdfplumber

    found = []
    with pdfplumber.open(path) as document:
        total = len(document.pages)
        for index in parse_pages(pages_spec, total):
            page = document.pages[index]
            for order, table in enumerate(page.extract_tables()):
                rows = [[('' if cell is None else cell) for cell in row] for row in table]
                found.append({
                    'page': index + 1,
                    'table': order + 1,
                    'rows': len(rows),
                    'columns': max((len(row) for row in rows), default=0),
                    'truncated': len(rows) > max_rows,
                    'data': rows[:max_rows],
                })
    return {'mode': 'table', 'pages_total': total, 'tables_found': len(found), 'tables': found}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['diagnose', 'text', 'table', 'image', 'embed'])
    parser.add_argument('input', type=Path)
    parser.add_argument('--out', type=Path, help='把 JSON 报告同时写到该文件')
    parser.add_argument('--outdir', type=Path, help='image / embed 模式的输出目录')
    parser.add_argument('--scale', type=float, default=2.0, help='image 模式的渲染倍率，默认 2.0')
    parser.add_argument('--pages', help='页码表达式，如 1,3-5；默认全部')
    parser.add_argument('--max-rows', type=int, default=50, help='table 模式每张表最多返回的行数')
    args = parser.parse_args()

    if not args.input.is_file():
        parser.error(f'input is not a file: {args.input}')
    if args.mode in ('image', 'embed') and args.outdir is None:
        parser.error(f'--outdir is required for {args.mode} mode')

    if args.mode == 'diagnose':
        report = run_diagnose(args.input)
    elif args.mode == 'text':
        report = run_text(args.input, args.pages)
    elif args.mode == 'table':
        report = run_table(args.input, args.pages, args.max_rows)
    elif args.mode == 'image':
        report = run_image(args.input, args.outdir, args.scale, args.pages)
    else:
        report = run_embed(args.input, args.outdir)

    payload = json.dumps(report, ensure_ascii=True, indent=2) + '\n'
    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(payload, encoding='utf-8')
    sys.stdout.write(payload)
    return 0


if __name__ == '__main__':
    sys.exit(main())
