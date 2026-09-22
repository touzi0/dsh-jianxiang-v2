#!/usr/bin/env node
/**
 * dsh-git-panel 真机验收脚本（Playwright + 本机 Edge，headless）。
 *
 * 用法：
 *   node 插件\dsh-git-panel\verify-ui.mjs                 # 自动读 dsh-home\.web-url
 *   node 插件\dsh-git-panel\verify-ui.mjs "http://127.0.0.1:3080/?token=..."
 *
 * 验证两件事：
 *   A. 右侧面板默认宽度 = 对话内容右边缘到框架右边缘的剩余空间，且对话区宽度与位置不变、
 *      不占用网格轨道；窗口缩放后重算。
 *   B. Git 面板：入口按钮能打开标签页，能列出仓库/分支/改动文件，能看 diff 与提交历史。
 *
 * 证据写到工作区外的 .jx-verify\ 目录（截图 + JSON），不污染仓库。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const EVIDENCE = resolve(ROOT, '..', '.jx-verify')
const STAMP = new Date().toISOString().replace(/[:.]/gu, '-')
// playwright 只装在 apps/web 下（浏览器自动化是它自己的 devDependency）。
const { chromium } = createRequire(join(ROOT, 'apps', 'web', 'package.json'))('playwright')

const results = []
/** 记一条断言结果。 */
function check(name, pass, detail) {
  results.push({ name, pass: pass === true, detail })
  console.log(`${pass === true ? 'PASS' : (pass === null ? 'SKIP' : 'FAIL')}  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

/** 读取本轮服务的带令牌地址。 */
function resolveUrl() {
  const arg = process.argv[2]
  if (arg !== undefined && arg !== '') return arg
  const file = join(ROOT, 'dsh-home', '.web-url')
  try {
    const text = readFileSync(file, 'utf8').trim()
    if (text !== '') return text
  } catch {
    // 启动器尚未写出地址（或服务不是用启动器起的）：下面统一报错。
  }
  throw new Error(`拿不到服务地址：请在命令行里直接传 URL，或先让 启动坚祥.bat 写出 ${file}`)
}

/** 读页面里的几何事实。 */
const PROBE = `() => {
  const frame = document.querySelector('[data-rightbar-col]')?.parentElement
  const content = document.querySelector('[data-conversation-content] [data-chat-flow]')
  const panel = document.querySelector('[data-sidebar-right-panel]')
  const rect = element => element === null || element === undefined
    ? null
    : (({ x, y, width, height, left, right }) => ({ x, y, width, height, left, right }))(element.getBoundingClientRect())
  return {
    frame: rect(frame),
    content: rect(content),
    panel: rect(panel),
    panelOpen: panel === null ? null : panel.getAttribute('data-sidebar-right-open') !== null,
    tracks: frame === null || frame === undefined ? null : frame.style.gridTemplateColumns,
    expandButton: document.querySelector('[data-sidebar-right-expand]') !== null,
    gitEntry: document.querySelector('[data-jx-git-entry]') !== null,
    gitPanel: document.querySelector('[data-jx-git-panel]') !== null,
    conversation: document.querySelector('[data-conversation-content]') !== null,
  }
}`

/** 数字比较（容差）。 */
const near = (a, b, tolerance) => a !== null && b !== null && Math.abs(a - b) <= tolerance

const url = resolveUrl()
mkdirSync(EVIDENCE, { recursive: true })
const consoleErrors = []

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1040 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', error => { consoleErrors.push(String(error)) })

  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-rightbar-col]', { timeout: 60_000 })

  // 打开一个会话（最近的第一个），让对话内容列出现。
  if (!(await page.evaluate(PROBE)).conversation) {
    const row = page.locator('[role="treeitem"]').first()
    if (await row.count() > 0) {
      await row.click()
      await page.waitForTimeout(1500)
    }
  }
  await page.waitForSelector('[data-conversation-content]', { timeout: 30_000 })

  // ---- A1: 打开前的对话区几何 ------------------------------------------------
  const before = await page.evaluate(PROBE)
  check('打开前：对话内容列可测量', before.content !== null && before.content.width > 200, JSON.stringify(before.content))

  let opened = false
  if (before.expandButton) {
    await page.click('[data-sidebar-right-expand]')
    opened = true
  } else if (before.panelOpen === true) {
    opened = true
  }
  await page.waitForTimeout(900)
  const after = await page.evaluate(PROBE)

  check('右侧面板已打开', opened && after.panelOpen === true, `panelOpen=${String(after.panelOpen)}`)
  check('对话区宽度不变（±1px）', near(before.content?.width ?? null, after.content?.width ?? null, 1),
    `before=${before.content?.width} after=${after.content?.width}`)
  check('对话区右边缘不变（±2px）', near(before.content?.right ?? null, after.content?.right ?? null, 2),
    `before=${before.content?.right} after=${after.content?.right}`)
  const expected = after.frame === null || after.content === null ? null : Math.round(after.frame.right - after.content.right - 24)
  check('面板宽度 = 框架右边缘 − 对话内容右边缘 − 24', near(after.panel?.width ?? null, expected, 3),
    `panel=${after.panel?.width} 期望=${expected}`)
  check('面板左边缘贴着对话内容右边缘（+24 间隔）',
    after.panel !== null && after.content !== null && near(after.panel.left - after.content.right, 24, 3),
    `panel.left=${after.panel?.left} content.right=${after.content?.right}`)
  check('没有占用网格轨道（第三轨 = 0px）', /(^|\s)0px$/u.test(after.tracks ?? '') || (after.tracks ?? '') === '', `tracks=${after.tracks}`)
  await page.screenshot({ path: join(EVIDENCE, `panel-open-1920-${STAMP}.png`) })

  // ---- A2: 窗口缩放后重算 ----------------------------------------------------
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.waitForTimeout(900)
  const narrow = await page.evaluate(PROBE)
  check('1400px 宽：对话区宽度未变（容差 2px）', near(before.content?.width ?? null, narrow.content?.width ?? null, 2),
    `before=${before.content?.width} now=${narrow.content?.width}`)
  const expectedNarrow = narrow.frame === null || narrow.content === null ? null : Math.round(narrow.frame.right - narrow.content.right - 24)
  const narrowOk = narrow.panel !== null && narrow.frame !== null && narrow.content !== null
    // 剩余空间不足 300px 时会退回「框架 45% + 占轨道」的兜底，这里两种结果都算通过。
    && (near(narrow.panel.width, expectedNarrow, 3) || narrow.panel.width === Math.round(narrow.frame.width * 0.45))
  check('1400px 宽：面板宽度按剩余空间重算（或落入窄屏兜底）', narrowOk,
    `panel=${narrow.panel?.width} 剩余空间=${expectedNarrow}`)
  await page.screenshot({ path: join(EVIDENCE, `panel-open-1400-${STAMP}.png`) })

  await page.setViewportSize({ width: 2560, height: 1200 })
  await page.waitForTimeout(900)
  const wide = await page.evaluate(PROBE)
  check('2560px 宽：对话区宽度未变（容差 2px）', near(before.content?.width ?? null, wide.content?.width ?? null, 2),
    `before=${before.content?.width} now=${wide.content?.width}`)
  const expectedWide = wide.frame === null || wide.content === null ? null : Math.round(wide.frame.right - wide.content.right - 24)
  check('2560px 宽：面板仍等于剩余空间', near(wide.panel?.width ?? null, expectedWide, 3),
    `panel=${wide.panel?.width} 期望=${expectedWide}`)
  await page.screenshot({ path: join(EVIDENCE, `panel-open-2560-${STAMP}.png`) })

  // ---- B: Git 面板 ----------------------------------------------------------
  await page.setViewportSize({ width: 1920, height: 1040 })
  await page.waitForTimeout(600)
  const entry = await page.evaluate(PROBE)
  if (!entry.gitEntry) {
    check('Git 面板入口存在', null, '未找到 [data-jx-git-entry]：dsh-git-panel 尚未被服务加载（需要重启服务后再跑本脚本）')
  } else {
    check('Git 面板入口存在', true)
    await page.click('[data-jx-git-entry]')
    await page.waitForSelector('[data-jx-git-panel]', { timeout: 20_000 })
    await page.waitForTimeout(2500)
    const git = await page.evaluate(`() => {
      const panel = document.querySelector('[data-jx-git-panel]')
      return {
        text: panel === null ? '' : panel.innerText,
        files: panel === null ? 0 : panel.querySelectorAll('[data-jx-git-file]').length,
        commits: panel === null ? 0 : panel.querySelectorAll('[data-jx-git-commit]').length,
        repos: panel === null ? 0 : panel.querySelectorAll('[data-jx-git-repo] option').length,
      }
    }`)
    check('Git 面板渲染出内容', git.text.length > 0, `${git.text.split('\n').slice(0, 3).join(' | ')}`)
    check('列出改动文件', git.files > 0, `files=${git.files}`)
    check('列出提交历史', git.commits > 0, `commits=${git.commits}`)

    if (git.files > 0) {
      await page.click('[data-jx-git-file]')
      await page.waitForSelector('[data-jx-git-diff]', { timeout: 20_000 })
      const diff = await page.evaluate(`() => {
        const pre = document.querySelector('[data-jx-git-diff]')
        const text = pre === null ? '' : pre.innerText
        return { lines: text.split('\\n').length, added: (text.match(/^\\+/gmu) ?? []).length, removed: (text.match(/^-/gmu) ?? []).length }
      }`)
      check('文件 diff 逐行渲染', diff.lines > 0 && diff.added > 0, JSON.stringify(diff))
      await page.screenshot({ path: join(EVIDENCE, `git-diff-${STAMP}.png`) })
    }

    if (git.commits > 0) {
      await page.click('[data-jx-git-commit]')
      await page.waitForTimeout(2500)
      const commit = await page.evaluate(`() => {
        const panel = document.querySelector('[data-jx-git-panel]')
        return panel === null ? '' : panel.innerText
      }`)
      check('提交详情可展开', commit.includes('改动文件'), commit.split('\n').slice(-6).join(' | '))
      await page.screenshot({ path: join(EVIDENCE, `git-commit-${STAMP}.png`) })
    }
    await page.screenshot({ path: join(EVIDENCE, `git-panel-${STAMP}.png`) })
  }

  check('控制台无错误', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' || '))

  const report = {
    url,
    at: new Date().toISOString(),
    measurements: { before, after, narrow, wide },
    consoleErrors,
    results,
  }
  const reportPath = join(EVIDENCE, `git-panel-verify-${STAMP}.json`)
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`\n证据：${reportPath}`)
  console.log(`截图目录：${EVIDENCE}`)
  const failed = results.filter(entry => entry.pass === false)
  console.log(`\n结果：${String(results.length - failed.length)}/${String(results.length)} 通过${failed.length === 0 ? '' : `，失败 ${String(failed.length)} 项`}`)
  await context.close()
  process.exitCode = failed.length === 0 ? 0 : 1
} finally {
  await browser.close()
}
