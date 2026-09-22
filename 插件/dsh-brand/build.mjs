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
const OFFICIAL_PRODUCT_TITLES = ["DSH Local Build", "DSH 本地构建"]

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
}

function apply(ctx) {
  ctx.slots.inject("sidebar.brand.mark", () => ctx.slots.register(
    { name: "sidebar.brand.mark" },
    (props) => Mark({ size: props.size ?? 24 })))
  ctx.slots.inject("sidebar.brand.name", () => ctx.slots.register(
    { name: "sidebar.brand.name" },
    () => React.createElement(BrandName)))
  // 新建对话页大标识（官方 ui-brand-official 同槽占用者，后注册者替换）。
  ctx.slots.inject("conversation.hero.brand.mark", () => ctx.slots.register(
    { name: "conversation.hero.brand.mark" },
    (props) => Mark({ size: props.size ?? 34, className: props.className })))
  const start = () => {
    if (document.body) startDomObservers()
    else setTimeout(start, 300)
  }
  start()
  return () => {
    if (domObserver) domObserver.disconnect()
    if (titleObserver) titleObserver.disconnect()
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
