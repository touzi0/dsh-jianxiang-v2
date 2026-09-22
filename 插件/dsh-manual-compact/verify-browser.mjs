/**
 * dsh-manual-compact 端到端浏览器验证。
 *
 * 前置：坚祥服务已（重）启动，dsh-home\.web-url 里有带令牌的网址。
 * 做什么（全程 headless Edge + 截图存证）：
 *   1. 打开网页，确认没有「Failed to load plugins」；
 *   2. 新建会话，发两条短消息（每轮回复完成后按钮行才会出现）；
 *   3. 点第一轮的「压缩到此轮为止」→ 确认框 →「开始压缩」；
 *   4. 断言：官方「上下文已压缩」行出现、第一轮按钮行消失（内容被摘要替换）、
 *      完成文案带数字回包；若失败则把错误文案抓出来；
 *   5. 再发第三条消息，验证会话仍能正常对话。
 * 跑法：`node verify-browser.mjs`（截图落在本目录 verify-shots\）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PKG_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(PKG_DIR, '../..')
const SHOTS = join(PKG_DIR, 'verify-shots')
mkdirSync(SHOTS, { recursive: true })

const URL_FILE = join(ROOT, 'dsh-home', '.web-url')
if (!existsSync(URL_FILE)) {
  console.error('[verify] 找不到 dsh-home\\.web-url —— 请先（重）启动服务再跑本脚本。')
  process.exit(1)
}
const webUrl = readFileSync(URL_FILE, 'utf8').trim()
if (!webUrl.startsWith('http')) {
  console.error(`[verify] .web-url 内容不是网址：${webUrl.slice(0, 80)}`)
  process.exit(1)
}

// playwright 在仓库 .pnpm 里（官方 e2e 基建），浏览器用系统 Edge（免下载 chromium）。
const pnpmDir = join(ROOT, 'node_modules', '.pnpm')
const playwrightDir = readdirSync(pnpmDir).find(name => /^playwright@\d/.test(name))
if (playwrightDir === undefined) {
  console.error(`[verify] 在 ${pnpmDir} 找不到 playwright。`)
  process.exit(1)
}
const { chromium } = await import(pathToFileURL(join(pnpmDir, playwrightDir, 'node_modules', 'playwright', 'index.mjs')).href)

const results = []
const record = (label, ok, detail = '') => {
  results.push({ label, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail === '' ? '' : ` —— ${detail}`}`)
}
const shot = async (page, name) => {
  await page.screenshot({ path: join(SHOTS, name), fullPage: false })
  console.log(`[shot] ${name}`)
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.setDefaultTimeout(60000)

  await page.goto(webUrl, { waitUntil: 'domcontentloaded' })
  // 应用就绪：输入区出现（textarea 或 contenteditable）。
  await page.waitForSelector('textarea, [contenteditable="true"]', { timeout: 60000 })
  const failedPlugins = await page.locator('text=Failed to load plugins').count()
  record('页面加载且无「Failed to load plugins」', failedPlugins === 0)
  await shot(page, '01-loaded.png')

  // 新建会话（官方按钮类名形如 [hash]_newSession）。
  const newSession = page.locator('button[class*="newSession"]').first()
  if (await newSession.count() > 0) {
    await newSession.click()
    await page.waitForTimeout(1200)
  }
  await shot(page, '02-new-session.png')

  // 发消息并等一轮完成（轮完成后我们的按钮才渲染）。
  const sendAndSettle = async (text, expectButtons) => {
    const composer = page.locator('textarea:visible, [contenteditable="true"]:visible').last()
    await composer.click()
    await composer.fill(text)
    await composer.press('Enter')
    await page.waitForFunction(
      expected => document.querySelectorAll('button.jx-manual-compact-action').length >= expected,
      expectButtons,
      { timeout: 240000 },
    )
  }

  await sendAndSettle('请只用一句话回答：1+1 等于几？', 1)
  record('第 1 轮完成且按钮行里出现「压缩」按钮', true)
  await shot(page, '03-turn1.png')

  await sendAndSettle('再只用一句话回答：北京是哪个国家的首都？', 2)
  record('第 2 轮完成（此时共 2 个压缩按钮）', true)
  await shot(page, '04-turn2.png')

  // 点第一轮的压缩按钮（非最新轮按钮行是 hover 显示，用 force 绕过可见性检查）。
  const firstCompact = page.locator('button.jx-manual-compact-action').first()
  await firstCompact.hover()
  await firstCompact.click({ force: true })
  await page.waitForSelector('[role="dialog"]', { timeout: 15000 })
  const dialogText = await page.locator('[role="dialog"]').innerText()
  record('确认框出现且写明轮次', dialogText.includes('压缩此轮及之前的对话') && dialogText.includes('第 1 轮'), dialogText.replace(/\s+/g, ' ').slice(0, 120))
  await shot(page, '05-confirm.png')

  await page.locator('[role="dialog"] button', { hasText: '开始压缩' }).click()
  // 压缩要调一次模型摘要，放宽到 4 分钟。
  await page.waitForFunction(() => {
    const text = document.querySelector('[role="dialog"]')?.textContent ?? ''
    return text.includes('已完成') || text.includes('压缩没有执行')
  }, undefined, { timeout: 240000 })
  const resultText = await page.locator('[role="dialog"]').innerText()
  const compactOk = resultText.includes('已完成')
  record(compactOk ? '压缩完成（数字回包）' : '压缩失败（错误文案）', compactOk, resultText.replace(/\s+/g, ' ').slice(0, 200))
  await shot(page, '06-result.png')

  // 关掉结果对话框。
  await page.locator('[role="dialog"] button', { hasText: '关闭' }).last().click()
  await page.waitForTimeout(800)

  // 断言官方压缩行出现 + 第一轮按钮行消失（内容被摘要替换）。
  await page.waitForFunction(() => document.body.textContent.includes('上下文已压缩'), undefined, { timeout: 30000 })
  record('会话流出现官方「上下文已压缩」行', true)
  const buttonsAfter = await page.locator('button.jx-manual-compact-action').count()
  record('第一轮按钮行随摘要替换消失（按钮 2 → 1）', buttonsAfter === 1, `当前按钮数=${buttonsAfter}`)
  await shot(page, '07-compacted.png')

  // 会话还能继续正常对话。
  await sendAndSettle('再只用一句话回答：2+2 等于几？', 2)
  record('压缩后继续对话正常（第 3 轮完成）', true)
  await shot(page, '08-continued.png')
} catch (error) {
  record('流程中断', false, String(error).slice(0, 300))
} finally {
  await browser.close()
}

const failedCount = results.filter(item => !item.ok).length
console.log(failedCount === 0
  ? `全部通过（${results.length} 项）`
  : `${failedCount}/${results.length} 项失败`)
if (failedCount > 0) process.exitCode = 1
