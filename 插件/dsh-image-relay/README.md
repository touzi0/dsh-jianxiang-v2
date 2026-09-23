# dsh-image-relay（图片代理）

让不具备看图能力的模型在对话中**收不到图片**（只收到带附件摘要的占位文本），同时给模型提供
**view_image 工具**：调用后插件把图片转发给一个具备视觉能力的模型，识别结果以文字返回。

## 职责划分（刻意保持极简）

| 事情 | 谁做的 | 说明 |
|---|---|---|
| 占位符替换 | 官方 dsh-llm 核心（内置，无需插件） | 模型在目录里声明为纯文本（`input: [text]`）时，请求组装自动把每个图片出现位置换成 `[image omitted because this model accepts text only; attachment sha256:<digest>]`，会话历史不改。**模型声明要与网关实际能力一致**——此前 glm-5.3 被误声明为 `[text, image]`，图片被直发、zai 网关回 400（code 1210 "messages.content.type 参数非法"）；2026-09-23 修正：仅 glm-5.3 改为 `[text]`（日志实测它只收 text），GLM-5.3-Flash 保持 `[text, image]`（支持看图，日志无反证） |
| view_image 工具 | 本插件 | 模型从占位符取附件摘要调用；插件从会话表层挖出持久图片引用，转发给视觉模型（配置指定或自动挑选 `inputModalities` 含 `image` 的第一个模型），把文字识别结果返回给模型，超长截断 |
| 系统提示段 | 本插件 | 一小段固定文本，教模型看到占位符时主动调工具（视觉模型看不到占位符，提示无害） |

曾经做过一个"保险丝"（拦截图片类请求错误、自动卸载图片并重试），已删除：治本在配置层
（把模型如实声明为纯文本），错误声明属于配置错误，改一行配置即可，不值得常驻运行时代码。

## 配置（全部可选）

| 字段 | 默认 | 说明 |
|---|---|---|
| `visionProvider` | 自动 | 视觉模型提供方 id；与 `visionModel` 一起填则不自动挑选 |
| `visionModel` | 自动 | 视觉模型 id |
| `maxAnswerChars` | 8000 | 识别结果返回给模型的最大字符数 |

自动挑选条件：`listModels` 返回的 `inputModalities` 含 `image`，成功后缓存。

## 依赖

至少要有一个可用的视觉模型（DeepSeek 官方的 vision 模型，或 pi-ai 网关目录里如实声明了
`input: [text, image]` 的模型），否则 view_image 调用时会在自动挑选处报错，提示显式配置。

## 安装与生效

本模组是纯宿主模组（手写 ESM 产物，无需构建）：

1. 文件夹放 `插件\dsh-image-relay\`（已就位）。
2. 网页 → 设置 → 插件 → **坚祥模组** → 重新扫描 → 打开开关。
3. **重启服务**（关服务器窗口 → 双击 `启动坚祥.bat`）生效。

## 指定视觉模型的挂载行配置示例

```jsonc
{
  "visionProvider": "deepseek",
  "visionModel": "deepseek-v4-flash-vision-exp",
  "maxAnswerChars": 8000
}
```
