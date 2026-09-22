---
name: pdf
description: Read PDF files — diagnose whether the text layer is trustworthy, extract text and tables, pull out embedded images, and render pages as pictures the model can look at. Use when a PDF is an input, or when the user mentions PDF and wants its 文字、表格、图片 read, or says the text 复制不出来、是乱码、扫描件.
---

# PDF 文档

PDF 有四条读取通路。**先跑 `diagnose` 再决定**，不要凭感觉猜：

```text
<python> <skill-directory>/../scripts/pdf_tool.py diagnose <input.pdf>
```

`diagnose` 给出 `verdict`，照它走：

| verdict | 含义 | 下一步 |
|---|---|---|
| `text-usable` | 有正常文字层 | 用 `text` 读文字；需要表格再加 `table` |
| `image-only` | 没有文字层（扫描件） | 用 `image` 渲染成图，自己看图理解 |
| `text-suspect` | 有文字层但**可疑** | 用 `image`；`text` 的结果不可信 |

`text-suspect` 是重点：反复制型 PDF 的字体子集没有 ToUnicode 映射，抽出来落在
私用区或控制区，看着像文字其实是乱码。`diagnose` 用字符分布识别这种情况
（`private_use` / `control` / `replacement` 占比，以及实义字符比例）。
**它给的是怀疑，不是判决**——你仍要扫一眼 `sample` 字段确认。

## 准备解释器

按用户或适用的 AGENTS.md 指定的环境执行；否则调用 `load_workspace_dependencies`，
用返回的 Python 路径——它已内置 `pypdfium2`（诊断/文本/渲染）、`pdfplumber`（表格）、
`pypdf`（内嵌图片）。不要安装 pip 包，也不要去找系统 Python。
`<skill-directory>` 是本技能的资源目录，脚本在其同级 `scripts/` 下。

## 读文字

```text
<python> <skill-directory>/../scripts/pdf_tool.py text <input.pdf> --pages 1-3 --out <report.json>
```

**不要**把整份长 PDF 一次读进上下文：先 `--pages` 限定，看完再决定下一页。
报告含每页 `text` 与 `chars`。若某页 `chars` 异常低或内容读不通，回到 `image`。

## 读表格

```text
<python> <skill-directory>/../scripts/pdf_tool.py table <input.pdf> --pages 2 --max-rows 50
```

每张表给出 `rows` / `columns` / `data`（行列表），可直接落 Excel 或写进文档。
`--max-rows` 默认 50，防止一张大表灌满上下文。

**表格识别靠版面线条，会有误判**：可能把一段排版识别成 1 列表格，也可能漏掉
无线框表。拿到结果先看 `rows`×`columns` 是否合理——若出现"很多行但只有 1 列"，
大概率是误判，改用 `text` 读该页，或 `image` 自己看。表结构复杂时优先 `image`。

## 渲染成图片（扫描件与乱码件的通路）

```text
<python> <skill-directory>/../scripts/pdf_tool.py image <input.pdf> --outdir <dir> --scale 2
```

产出 `page-001.png` 等，然后用 `read_image` 逐张看，**每批 1–3 张**，不要一次要 20 页。
`--scale` 默认 2.0：字小的合同用 3，页多时用 `--pages` 分批。

`read_image` 要求当前模型路由声明了图片输入；未声明时会直接报错——那是路由限制，
不是文件问题。此时改用 `text`/`table`，并如实告诉用户"本模型看不了图"。

## 抽出内嵌图片

```text
<python> <skill-directory>/../scripts/pdf_tool.py embed <input.pdf> --outdir <dir>
```

产出文档里嵌的原图（照片、扫描图、图表）。想看"整页长什么样"用 `image`，不是这个。

## 交付与检查

- 输出文件留在工作目录；用 `present` 交付最终产物。
- 报告 JSON、渲染出的 PNG 都是中间产物，除非用户要，不要交付。
- 转出来的表格若要交给用户，建议再落成 `.xlsx` 并交付那个文件。

## 边界

- 只读：不修改源 PDF。
- **不做 OCR**。扫描件靠 `image` 让模型**看**，不是靠文字抽取。需要可复制文字时，
  如实说明没有 OCR，不要凭图片臆造精确字符（数字、编号尤其危险）。
- 加密（有口令）的 PDF 打不开，会报错——如实告诉用户，不要猜内容。
- 中文等 CJK 能否抽出取决于字体是否带映射；`diagnose` 判为可疑时不要硬读，
  更不要把乱码当内容汇报。
- 表格误判是已知限制，见上文。
