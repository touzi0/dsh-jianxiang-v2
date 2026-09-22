#!/usr/bin/env python3
"""对图片做 OCR：识别文字、给出每块文字的位置与置信度。

引擎是 RapidOCR（PP-OCRv4，Apache-2.0），**模型随包分发、完全离线**，
不联网下载。检测、识别、方向分类三合一，中英文共用同一套模型。

输入是图片（PNG/JPG/WebP/BMP/TIFF）。PDF 要先由 pdf 技能渲染成图片再进来——
两个技能各司其职，本工具不认识 PDF。

JSON 报告写到标准输出；非 ASCII 一律转义，避免控制台编码问题。

用法：
  python ocr_tool.py text  <image> [--min-score 0.5] [--out report.json]
  python ocr_tool.py lines <image> [--min-score 0.5] [--outlined <path.png>]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

IMAGE_SUFFIXES = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff'}


def run_engine(image: Path, min_score: float):
    """建立引擎并跑一次识别。

    :param image: 输入图片路径。
    :param min_score: 低于该置信度的结果丢弃。
    :returns: (引擎结果列表, 引擎) —— 结果每项为 [框, 文本, 置信度]。
    """
    from rapidocr_onnxruntime import RapidOCR

    engine = RapidOCR()
    result, _ = engine(str(image))
    rows = [] if result is None else [row for row in result if float(row[2]) >= min_score]
    return rows, engine


def box_of(row) -> list[list[float]]:
    """把引擎坐标规范成浮点列表，便于 JSON 序列化。"""
    return [[round(float(x), 2), round(float(y), 2)] for x, y in row[0]]


def run_text(image: Path, min_score: float) -> dict:
    """识别并拼接全文，同时保留逐块结果。"""
    rows, _ = run_engine(image, min_score)
    blocks = [
        {
            'text': str(row[1]),
            'score': round(float(row[2]), 4),
            'box': box_of(row),
        }
        for row in rows
    ]
    # 按纵坐标排序后拼接，尽量还原阅读顺序（引擎已大致按此输出，这里再稳一次）。
    ordered = sorted(blocks, key=lambda block: (round(block['box'][0][1] / 10), block['box'][0][0]))
    lines = [block['text'] for block in ordered]
    scores = [block['score'] for block in blocks]
    return {
        'mode': 'text',
        'image': str(image),
        'blocks': len(blocks),
        'text': '\n'.join(lines),
        'mean_score': round(sum(scores) / len(scores), 4) if scores else None,
        'min_score': min(scores) if scores else None,
        'detail': blocks,
    }


def run_lines(image: Path, min_score: float, outlined: Path | None) -> dict:
    """按行输出，只给文本、置信度与框，便于逐行核对。"""
    from rapidocr_onnxruntime import RapidOCR

    engine = RapidOCR()
    result, elapse = engine(str(image))
    rows = [] if result is None else [row for row in result if float(row[2]) >= min_score]
    lines = [
        {
            'index': index + 1,
            'text': str(row[1]),
            'score': round(float(row[2]), 4),
            'box': box_of(row),
        }
        for index, row in enumerate(rows)
    ]
    report = {
        'mode': 'lines',
        'image': str(image),
        'lines': len(lines),
        'elapse': [round(float(value), 4) for value in elapse] if elapse else None,
        'detail': lines,
    }
    if outlined is not None:
        # 引擎自带可视化：把识别框画回图上，便于模型对照"哪块文字对应哪一行"。
        import cv2

        canvas = cv2.imread(str(image))
        if canvas is not None:
            for row in rows:
                points = [[int(x), int(y)] for x, y in row[0]]
                for index in range(len(points)):
                    cv2.line(canvas, tuple(points[index]), tuple(points[(index + 1) % len(points)]), (0, 0, 255), 2)
            outlined.parent.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(outlined), canvas)
            report['outlined'] = str(outlined)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['text', 'lines'])
    parser.add_argument('input', type=Path)
    parser.add_argument('--out', type=Path, help='把 JSON 报告同时写到该文件')
    parser.add_argument('--min-score', type=float, default=0.5, help='置信度下限，默认 0.5')
    parser.add_argument('--outlined', type=Path, help='lines 模式：把识别框画回图并保存到该路径')
    args = parser.parse_args()

    if not args.input.is_file():
        parser.error(f'input is not a file: {args.input}')
    if args.input.suffix.lower() not in IMAGE_SUFFIXES:
        parser.error(f'input must be an image ({", ".join(sorted(IMAGE_SUFFIXES))}); '
                     'render PDF pages to images with the pdf skill first')

    if args.mode == 'text':
        report = run_text(args.input, args.min_score)
    else:
        report = run_lines(args.input, args.min_score, args.outlined)

    payload = json.dumps(report, ensure_ascii=True, indent=2) + '\n'
    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(payload, encoding='utf-8')
    sys.stdout.write(payload)
    return 0


if __name__ == '__main__':
    sys.exit(main())
