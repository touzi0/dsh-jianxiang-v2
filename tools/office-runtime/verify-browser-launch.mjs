// 实测：用仓库内已有的 playwright-core 驱动本机 Chrome，验证浏览器通道真的可用。
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = process.argv[2]
const store = join(REPO, 'node_modules', '.pnpm')
const mcpDir = readdirSync(store).find((name) => name.startsWith('@playwright+mcp@'))
if (mcpDir === undefined) throw new Error('未找到 @playwright/mcp')
// index.mjs 是 ESM 入口；index.js 是 CJS，按 ESM 导入会拿不到命名导出。
const coreEntry = join(store, mcpDir, 'node_modules', 'playwright-core', 'index.mjs')
console.log(`playwright-core 入口：${coreEntry.replace(REPO, '.')}`)

const { chromium } = await import(pathToFileURL(coreEntry).href)
const executablePath = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
console.log(`启动 Chrome：${executablePath}`)
const started = Date.now()
const browser = await chromium.launch({ executablePath, headless: true })
console.log(`  已启动（${Date.now() - started} ms），版本：${browser.version()}`)

const page = await browser.newPage()
await page.setContent('<h1>DSH browser-use 实测</h1><p id="mark">浏览器通道可用</p>')
console.log(`  页面标题：${await page.title()}`)
console.log(`  读取元素：#mark -> ${await page.textContent('#mark')}`)

// 再测一次真实导航，确认网络与渲染链路都通。
await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 30_000 })
console.log(`  导航 example.com -> 标题「${await page.title()}」`)

await browser.close()
console.log('  浏览器已关闭。✅ 浏览器通道端到端可用')
