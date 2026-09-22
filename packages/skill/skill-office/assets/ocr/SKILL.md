---
name: ocr
description: Recognize text in images with an offline OCR engine, returning the text plus per-block confidence and positions. Use for scans, photos of documents, or any image whose text must become copyable characters, or when the user asks to 识别/提取图片文字、扫描件转文字、图片转文字.
---

# 图片 OCR

把**图片**里的文字识别成可复制的字符。引擎是 RapidOCR（PP-OCRv4），
中英文共用模型，**完全离线**（模型随运行时分发，不联网下载）。

**本技能只吃图片，不认识 PDF。** PDF 先用 `pdf` 技能渲染成图片：

```text
<python> <pdf技能目录>/../scripts/pdf_tool.py image <input.pdf> --outdir <dir> --scale 3
<python> <skill-directory>/../scripts/ocr_tool.py text <dir>/page-001.png --out scores.json
```

`--scale 3` 是有意的：OCR 对小字敏感，页面上 10pt 的字在 scale 2 时只有约 27px 高，
识别率明显下降。扫描件建议 3，字特别小或本身就模糊的上到 4。

## 准备解释器

按用户或适用的 AGENTS.md 指定的环境执行；否则调用 `load_workspace_dependencies`，
用返回的 Python 路径——它已内置 `rapidocr-onnxruntime`。不要安装 pip 包，
也不要去找系统 Python。首次调用会加载 ONNX 模型，有几秒延迟，属正常。

## 识别全文

```text
<python> <skill-directory>/../scripts/ocr_tool.py text <image> --min-score 0.5 --out <report.json>
```

返回 `text`（按阅读顺序拼接的全文）、`blocks`（块数）、`mean_score` / `min_score`
（置信度）与 `detail`（每块的文本、置信度、四点坐标）。

## 逐行核对

```text
<python> <skill-directory>/../scripts/ocr_tool.py lines <image> --outlined <marked.png>
```

每行给出 `index` / `text` / `score` / `box`。`--outlined` 会把识别框画回图上，
之后可以用 `read_image` 看那张图，对照"第几行识别的是画面哪一块"——
**内容重要或识别可疑时值得做这一步**。

## 置信度怎么用

`score` 是引擎的把握程度，不是正确率：

| 情况 | 处理 |
|---|---|
| `mean_score` ≥ 0.9 且各块都高 | 通常可用 |
| 个别块 < 0.6 | 那些字**必须**核对，不要直接采用 |
| 大面积 < 0.6 | 图片质量或分辨率不够，渲染更高 scale 重试 |

## 交付与检查

- 识别结果要交付时，落成 `.docx` 或 `.txt` 再 `present` 那个文件，不要交付 JSON。
- 报告 JSON 与标注图是中间产物，除非用户要，不要交付。
- 交付前抽查：随机挑几处**数字、编号、日期、金额**，回原图确认。
  这些是 OCR 最容易错的字符，也是代价最高的错。

## 边界

- **OCR 会出错，且错得没有规律。** 不要把它当作权威字符流。
  涉及金额、料号、合同条款时，明确告知用户"这是识别结果，请核对"。
- 手写体、艺术字、严重倾斜、低分辨率、复杂表格版式，识别率会显著下降；
  这些情况如实说明，不要用识别结果拼凑出看似完整的内容。
- 表格做 OCR 只会得到一堆散块，不会自动成表。要结构化请先考虑
  `pdf` 技能的 `table` 模式（有文字层时），或识别后自己按坐标重组。
- 只读：不修改源图片。
