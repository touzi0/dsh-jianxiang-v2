#!/usr/bin/env node
/**
 * 生成 lib/client.js：官方 client bundle 工厂格式 + 内嵌品牌 PNG（data URL）。
 * 无外部依赖；PNG 变更后重跑本脚本即可。
 *
 * 覆盖范围（v2）：
 * - sidebar.brand.mark / sidebar.brand.name（侧栏左上角，同 v1）；
 * - conversation.hero.brand.mark（新建对话页大标识，替换官方鱼形）；
 * - 新建对话页标题文案「探索未至之境/Into the Unknown」→「更人性化的数字助手」（DOM 观察者，
 *   官方无文案扩展槽，参考数字助理1 的 locales 改法）；
 * - 浏览器页面标题里的 "DSH Local Build" →「坚祥数字助理」（DocumentTitle 写入后即时改写）。
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG = dirname(fileURLToPath(import.meta.url))
const b64 = file => readFileSync(join(PKG, 'assets', file)).toString('base64')

const ink = `data:image/png;base64,${b64('jianxiang-mark-ink.png')}`
const white = `data:image/png;base64,${b64('jianxiang-mark-white.png')}`

const client = `window.__ModuleLoader__.load({ id: "dsh-brand", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
const React = require("react");
// 坚祥标识（深色墨版 / 深底白版），随系统主题切换——结构与官方 FishLogo 同款。
const INK = ${JSON.stringify(ink)};
const WHITE = ${JSON.stringify(white)};

const BRAND_NAME = "坚祥数字助理"
const HERO_HEADLINE = "更人性化的数字助手"
const OFFICIAL_HEADLINES = ["探索未至之境", "Into the Unknown"]
// official 构建档位（桌面打包用 DSH_CLIENT_BUILD_PROFILE=official 重建 dist）下产品名是
// "DeepSeek Harness"；local 档位是 "DSH Local Build" / "DSH 本地构建"。两种都改写。
const OFFICIAL_PRODUCT_TITLES = ["DSH Local Build", "DSH 本地构建", "DeepSeek Harness"]

/**
 * 干活中提示语的轮换池（同一组内按顺序轮换，定时器每 5s 推进一格）。
 * 文案源头是 dsh-transcript-fold 里被改写的 chat.deepDiving（zh 拼命干活中… / en Working hard…）；
 * 这里只做「显示层轮换」，不碰任何官方源码。
 * 5s 是用户选定的节奏：一句话看得完、又不显得着急刷屏（速度对照见 干活文案节奏预览.html）。
 */
const PHRASE_GROUPS = [
  ["拼命干活中…", "正在努力挣钱…", "大脑高速运转中…", "任务都交给我吧…", "稍等，马上就好…"],
  ["Working hard…", "Hard at work…", "On it…"],
]
const PHRASE_INTERVAL_MS = 5000
const PHRASE_SELECTOR = '[role="status"]'

const inject = ["slots"]

function Mark({ size, className }) {
  return React.createElement("svg", {
    width: size, height: size, viewBox: "0 0 512 512", fill: "none",
    "aria-hidden": "true", className: className, style: { display: "block" },
  },
    React.createElement("style", null,
      ".jx-ink{display:inline}.jx-wht{display:none}@media(prefers-color-scheme:dark){.jx-ink{display:none}.jx-wht{display:inline}}"),
    React.createElement("image", { className: "jx-ink", href: INK, x: 0, y: 0, width: 512, height: 512, preserveAspectRatio: "xMidYMid meet" }),
    React.createElement("image", { className: "jx-wht", href: WHITE, x: 0, y: 0, width: 512, height: 512, preserveAspectRatio: "xMidYMid meet" }))
}

function BrandName() {
  return React.createElement("span", null, BRAND_NAME)
}

/** 新建对话页标题文案改写：官方 hero.headline 无扩展槽，DOM 文本节点替换。 */
function rewriteHeroHeadline(root) {
  for (const span of root.querySelectorAll("span")) {
    if (span.getAttribute("data-jx-hero") === "1") continue
    const text = (span.textContent || "").trim()
    if (OFFICIAL_HEADLINES.includes(text)) {
      span.setAttribute("data-jx-hero", "1")
      span.textContent = HERO_HEADLINE
    }
  }
}

/** 浏览器标题改写：DocumentTitle 每次写入后把产品名换成坚祥（中英文案都处理，含会话名前缀）。 */
function rewriteDocumentTitle() {
  let value = document.title
  if (typeof value !== "string") return
  for (const official of OFFICIAL_PRODUCT_TITLES) {
    if (value.includes(official)) value = value.split(official).join(BRAND_NAME)
  }
  if (value !== document.title) document.title = value
}

let domObserver = null
let titleObserver = null
let phraseTimer = null

/**
 * 把「干活中」提示语轮换到下一格。
 * 官方列表流的状态行是 <div role="status">提示语<span>时钟</span></div>：提示语是**纯文本首子节点**，
 * 时钟是后面的元素节点。所以只改首文本节点，时钟（15s 后才出现）与 aria-live 都不受影响；
 * 认不出文案（不在池里）就整行跳过，绝不误改用户消息里的同款文字。
 */
function rotateLoadingPhrase() {
  for (const status of document.querySelectorAll(PHRASE_SELECTOR)) {
    const node = status.firstChild
    if (node === null || node.nodeType !== 3) continue
    const text = (node.nodeValue || "").trim()
    for (const group of PHRASE_GROUPS) {
      const index = group.indexOf(text)
      if (index < 0) continue
      const next = group[(index + 1) % group.length]
      node.nodeValue = next
      break
    }
  }
}

function startDomObservers() {
  domObserver = new MutationObserver(() => rewriteHeroHeadline(document))
  domObserver.observe(document.body, { childList: true, subtree: true, characterData: true })
  rewriteHeroHeadline(document)
  const titleElement = document.querySelector("title")
  if (titleElement !== null) {
    titleObserver = new MutationObserver(rewriteDocumentTitle)
    titleObserver.observe(titleElement, { childList: true, characterData: true, subtree: true })
  }
  rewriteDocumentTitle()
  if (phraseTimer === null) phraseTimer = setInterval(rotateLoadingPhrase, PHRASE_INTERVAL_MS)
}

function apply(ctx) {
  // priority: -1 —— single 槽 lowest renders；官方 ui-brand-official 在 official
  // 构建档位（DSH_CLIENT_BUILD_PROFILE=official，桌面打包重建 dist 时）会以默认
  // priority 0 注册同名槽，同优先级第二个注册会抛错并拖垮本插件（左侧标识与标题
  // 改写全部失效）。-1 盖过官方 0；local 档位官方不注册，-1 同样正常。
  ctx.slots.inject("sidebar.brand.mark", () => ctx.slots.register(
    { name: "sidebar.brand.mark", priority: -1 },
    (props) => Mark({ size: props.size ?? 24 })))
  ctx.slots.inject("sidebar.brand.name", () => ctx.slots.register(
    { name: "sidebar.brand.name", priority: -1 },
    () => React.createElement(BrandName)))
  // 新建对话页大标识（官方 ui-brand-official 不注册 hero 槽，无冲突；-1 保持一致）。
  ctx.slots.inject("conversation.hero.brand.mark", () => ctx.slots.register(
    { name: "conversation.hero.brand.mark", priority: -1 },
    (props) => Mark({ size: props.size ?? 34, className: props.className })))
  const start = () => {
    if (document.body) startDomObservers()
    else setTimeout(start, 300)
  }
  start()
  return () => {
    if (domObserver) domObserver.disconnect()
    if (titleObserver) titleObserver.disconnect()
    if (phraseTimer !== null) { clearInterval(phraseTimer); phraseTimer = null }
    rewriteDocumentTitle()
  }
}

exports.inject = inject
exports.apply = apply
return module.exports; } })
`

rmSync(join(PKG, 'lib'), { recursive: true, force: true })
mkdirSync(join(PKG, 'lib'), { recursive: true })
writeFileSync(join(PKG, 'lib', 'client.js'), client, 'utf8')
console.log('[build] dsh-brand lib/client.js 已生成（侧栏 + 新建对话页标识 + 文案/标题改写）。')
