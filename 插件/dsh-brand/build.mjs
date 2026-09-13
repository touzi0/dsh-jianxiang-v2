#!/usr/bin/env node
/**
 * 生成 lib/client.js：官方 client bundle 工厂格式 + 内嵌品牌 PNG（data URL）。
 * 无外部依赖；PNG 变更后重跑本脚本即可。
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

const inject = ["slots"]

function Mark({ size }) {
  return React.createElement("svg", {
    width: size, height: size, viewBox: "0 0 512 512", fill: "none",
    "aria-hidden": "true", style: { display: "block" },
  },
    React.createElement("style", null,
      ".jx-ink{display:inline}.jx-wht{display:none}@media(prefers-color-scheme:dark){.jx-ink{display:none}.jx-wht{display:inline}}"),
    React.createElement("image", { className: "jx-ink", href: INK, x: 0, y: 0, width: 512, height: 512, preserveAspectRatio: "xMidYMid meet" }),
    React.createElement("image", { className: "jx-wht", href: WHITE, x: 0, y: 0, width: 512, height: 512, preserveAspectRatio: "xMidYMid meet" }))
}

function BrandName() {
  return React.createElement("span", null, "坚祥数字助理")
}

function apply(ctx) {
  ctx.slots.inject("sidebar.brand.mark", () => ctx.slots.register(
    { name: "sidebar.brand.mark" },
    (props) => Mark({ size: props.size ?? 24 })))
  ctx.slots.inject("sidebar.brand.name", () => ctx.slots.register(
    { name: "sidebar.brand.name" },
    () => React.createElement(BrandName)))
}

exports.inject = inject
exports.apply = apply
return module.exports; } })
`

rmSync(join(PKG, 'lib'), { recursive: true, force: true })
mkdirSync(join(PKG, 'lib'), { recursive: true })
writeFileSync(join(PKG, 'lib', 'client.js'), client, 'utf8')
console.log('[build] dsh-brand lib/client.js 已生成（内嵌双主题 PNG）。')
