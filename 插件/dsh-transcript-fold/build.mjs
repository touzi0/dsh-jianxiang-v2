#!/usr/bin/env node
/**
 * 构建 dsh-transcript-fold 的浏览器半边。
 *
 * 官方 ui-chat 的折叠时机与分页交互写死在它的客户端包里，插件机制只能「替换原生行」，
 * 所以本模组的 lib/client.js 由官方 tsdown 从**打过补丁的官方源码**构建出来：
 *   1. 备份 packages/client/ui-chat 的被改源码与 lib/ 产物
 *   2. 落补丁：patch/ 下的整份替换文件 + INJECTIONS 里的定点注入
 *   3. cwd=该包目录 跑官方 tsdown（不设 DSH_BUILD_FACE → 直接编 src/client/index.ts）
 *   4. 把产物拷进本模组 lib/client.js，并把 __ModuleLoader__ 的 id 改成模组名
 *   5. finally 恢复官方源码与产物 —— 官方仓库源码保持零改动
 *
 * 官方升级后重跑本脚本即可；补丁锚点失配会显式失败，不会静默产出错包。
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(PKG, '../..')
const UI_CHAT = join(ROOT, 'packages', 'client', 'ui-chat')
const TSDOWN = join(ROOT, 'node_modules', 'tsdown', 'dist', 'run.mjs')
const OFFICIAL_ID = '@deepseek-ai/dsh-client-ui-chat'
const MOD_ID = 'dsh-transcript-fold'

/** 整份替换的补丁文件 → 官方源码路径（相对包目录）。 */
const PATCHES = [
  ['patch/turn-process.ts', 'src/client/conversation-nodes/turn-process.ts'],
  ['patch/ChatNodeSeat.tsx', 'src/client/chat/ChatNodeSeat.tsx'],
]

/**
 * 定点注入：官方大文件不适合整份拷贝，只做「锚点必须唯一命中」的文字替换。
 * 每项 edits 是 [原文, 替换]；原文命中 0 次或多次都直接失败。
 */
const INJECTIONS = [
  {
    // 坚祥：去掉「深度求索中...」这类品牌口吻的等待文案，换成中性的干活说法。
    target: 'src/client/locale.ts',
    edits: [
      ["  'chat.deepDiving': '深度求索中...',", "  'chat.deepDiving': '拼命干活中…',"],
      ["  'chat.deepDiving': 'Deep diving...',", "  'chat.deepDiving': 'Working hard…',"],
    ],
  },
  {
    target: 'src/client/chat/ChatView.tsx',
    edits: [
      [
        '  const listRef = useRef<HTMLDivElement | null>(null)\n'
        + '  const columnRef = useRef<HTMLDivElement | null>(null)',
        '  const listRef = useRef<HTMLDivElement | null>(null)\n'
        + '  const columnRef = useRef<HTMLDivElement | null>(null)\n'
        + '  /** 坚祥：自动加载更早历史——哨兵进入顶部 600px 预加载带就持续拉页。 */\n'
        + '  const olderSentinelRef = useRef<HTMLButtonElement | null>(null)\n'
        + '  const [olderNear, setOlderNear] = useState(false)\n'
        + '  /** 坚祥：连续拉页时钉住的那一行（视口中下部）与它在滚动容器里的坐标。 */\n'
        + '  const olderHoldRef = useRef<{ key: string, top: number } | null>(null)',
      ],
      [
        '    loadOlder()\n'
        + '  }\n'
        + '\n'
        + '  // Identity feeds the memoized rail; a fresh closure per render would defeat it.',
        '    loadOlder()\n'
        + '  }\n'
        + '\n'
        + '  // 坚祥：向上滚动时连续自动加载更早历史。哨兵就是「加载更早」按钮本身，\n'
        + '  // rootMargin 把滚动容器顶部再往上扩 600px，于是按钮还没露面就开始拉；\n'
        + '  // 只要哨兵还在带里就一页接一页地拉——用户一直往上滑就持续加载。\n'
        + '  useEffect(() => {\n'
        + '    const target = olderSentinelRef.current\n'
        + '    const list = listRef.current\n'
        + '    if (target === null || list === null || typeof IntersectionObserver === \'undefined\') return\n'
        + '    const observer = new IntersectionObserver((entries) => {\n'
        + '      for (const entry of entries) setOlderNear(entry.isIntersecting)\n'
        + '    }, { root: scrollerOf(list), rootMargin: \'600px 0px 0px 0px\' })\n'
        + '    observer.observe(target)\n'
        + '    return () => { observer.disconnect() }\n'
        + '  }, [hasMore])\n'
        + '\n'
        + '  // 坚祥：拉页前先记下「视口中下部那一行」，并让官方那套钉顶部的补偿让位——\n'
        + '  // 钉顶部会把用户往上滑的动作补偿掉（表现为卡住、滑不到底）。\n'
        + '  useEffect(() => {\n'
        + '    if (!olderNear || !hasMore || loadingOlder) return\n'
        + '    const list = listRef.current\n'
        + '    const hold = list === null ? null : foldHoldRow(list, scrollerOf(list))\n'
        + '    if (list === null || hold === null) {\n'
        + '      loadOlderAnchored()\n'
        + '      return\n'
        + '    }\n'
        + '    olderHoldRef.current = hold\n'
        + '    anchorRef.current = null\n'
        + '    loadOlder()\n'
        + '  }, [olderNear, hasMore, loadingOlder])\n'
        + '\n'
        + '  // 坚祥：一页落地（首行 seq 前移）后把那一行钉回原坐标——\n'
        + '  // 新内容长在上方，用户正在看的中下部内容保持不动。\n'
        + '  useLayoutEffect(() => {\n'
        + '    const hold = olderHoldRef.current\n'
        + '    const list = listRef.current\n'
        + '    if (hold === null || list === null) return\n'
        + '    const el = scrollerOf(list)\n'
        + '    const row = anchorElement(list, hold.key)\n'
        + '    if (row === null) return\n'
        + '    olderHoldRef.current = null\n'
        + '    el.scrollTop += flowTop(row, el) - hold.top\n'
        + '  }, [firstSeq])\n'
        + '\n'
        + '  // Identity feeds the memoized rail; a fresh closure per render would defeat it.',
      ],
      [
        '<button type="button" disabled={loadingOlder} onClick={loadOlderAnchored}>',
        '<button ref={olderSentinelRef} type="button" disabled={loadingOlder} onClick={loadOlderAnchored}>',
      ],
    ],
  },
  {
    target: 'src/client/chat/ChatView.tsx',
    edits: [
      [
        '/** Capture a reflow-resistant reader position from the current rendered window. */',
        '/** 坚祥：取视口约 70% 高度处那一行当锚点——连续预加载时新内容长在上方，这块内容不动。 */\n'
        + 'function foldHoldRow(list: HTMLElement, scrollport: HTMLElement): { key: string, top: number } | null {\n'
        + '  const viewport = scrollport.getBoundingClientRect()\n'
        + '  const target = viewport.top + viewport.height * 0.7\n'
        + '  let chosen: HTMLElement | null = null\n'
        + '  for (const row of list.querySelectorAll<HTMLElement>(\'[data-chat-flow-key]:not([hidden])\')) {\n'
        + '    if (row.getBoundingClientRect().top > target) break\n'
        + '    if (row.dataset.chatAnchorKey !== undefined) chosen = row\n'
        + '  }\n'
        + '  const key = chosen?.dataset.chatAnchorKey\n'
        + '  return chosen === null || key === undefined ? null : { key, top: flowTop(chosen, scrollport) }\n'
        + '}\n'
        + '\n'
        + '/** Capture a reflow-resistant reader position from the current rendered window. */',
      ],
    ],
  },
  {
    // 坚祥：复制/分支按钮改「官方图标 + 中文文字」（用户决策 2026-09-23）；
    // 字体参数逐条照抄官方用量/用时 pill（同字号、同行高，基线自然对齐）。
    // 并给按钮行定序：复制1 →（压缩2，由 manual-compact 提供）→ 分支3 →（朗读4）→ 用量5 → 时间6，
    // 只重排这些；其余元素不动，用量/用时/时间保持在按钮右侧的原位。
    target: 'src/client/chat/MessageIconActions.tsx',
    edits: [
      [
        '        <button type="button" className={css.action} aria-label={copied ? t(\'copied\') : t(\'copy\')} onClick={onCopy}>\n'
        + '          {copied ? <IconCheckOutline16 /> : <IconCopyOutline16 />}\n'
        + '        </button>',
        '        <button type="button" data-jx-text-action className={css.action} style={{ width: \'auto\', gap: \'4px\', padding: \'0 8px\', fontSize: \'var(--dsh-content-font-size-secondary, 13px)\', lineHeight: \'calc(24px + var(--dsh-content-font-delta, 0px))\', ...(clock === \'end\' ? { order: 1 } : {}) }} aria-label={copied ? t(\'copied\') : t(\'copy\')} onClick={onCopy}>\n'
        + '          {copied ? <><IconCheckOutline16 />{t(\'copied\')}</> : <><IconCopyOutline16 />{t(\'copy\')}</>}\n'
        + '        </button>',
      ],
      [
        '            className={css.action}\n'
        + '            aria-label={t(\'message.branch\')}',
        '            className={css.action}\n'
        + '            data-jx-text-action\n'
        + '            style={{ width: \'auto\', gap: \'4px\', padding: \'0 8px\', fontSize: \'var(--dsh-content-font-size-secondary, 13px)\', lineHeight: \'calc(24px + var(--dsh-content-font-delta, 0px))\', order: 3 }}\n'
        + '            aria-label={t(\'message.branch\')}',
      ],
      [
        '            <IconBranchOutline16 />',
        '            <><IconBranchOutline16 />分支</>',
      ],
      [
        '      {usageAction}',
        '      <span style={{ order: 5, display: \'inline-flex\' }}>{usageAction}</span>',
      ],
      [
        '    <span className={clock === \'start\' ? css.timeStart : css.timeEnd}>',
        '    <span style={clock === \'end\' ? { order: 6 } : undefined} className={clock === \'start\' ? css.timeStart : css.timeEnd}>',
      ],
    ],
  },
]

/** 构建产物必须含有的补丁标记（少一个就说明补丁没生效）。 */
const MARKERS = ['longNarrationAnchor', 'tailWindowAnchor', 'olderSentinelRef', 'foldHoldRow', '拼命干活中…', 'data-jx-text-action', '分支']

/** 构建期间需要原样恢复的产物。 */
const ARTIFACTS = ['lib/client.js', 'lib/index.js']

const BACKUP = '.jx-fold-backup'

function fail(message) {
  console.error(`[build] ${message}`)
  process.exitCode = 1
  throw new Error(message)
}

if (!existsSync(TSDOWN)) fail(`找不到官方 tsdown：${TSDOWN}`)

const touched = []

/** 备份一个文件；文件不存在时返回 false。 */
function backup(relPath) {
  const target = join(UI_CHAT, relPath)
  if (!existsSync(target)) return false
  copyFileSync(target, `${target}${BACKUP}`)
  touched.push(relPath)
  return true
}

/** 恢复全部备份并清掉备份文件。 */
function restore() {
  for (const relPath of touched) {
    const target = join(UI_CHAT, relPath)
    const backupPath = `${target}${BACKUP}`
    if (existsSync(backupPath)) {
      copyFileSync(backupPath, target)
      rmSync(backupPath, { force: true })
    }
  }
}

/** 统计一段文字在目标里出现的次数。 */
function occurrences(haystack, needle) {
  let count = 0
  let index = haystack.indexOf(needle)
  while (index >= 0) {
    count += 1
    index = haystack.indexOf(needle, index + needle.length)
  }
  return count
}

try {
  // 1a. 整份替换的补丁
  for (const [patch, target] of PATCHES) {
    if (!existsSync(join(PKG, patch))) fail(`缺少补丁文件：${patch}`)
    if (!existsSync(join(UI_CHAT, target))) fail(`官方源码路径不存在（升级后请核对）：${target}`)
    backup(target)
    copyFileSync(join(PKG, patch), join(UI_CHAT, target))
  }

  // 1b. 定点注入的补丁
  for (const { target, edits } of INJECTIONS) {
    const targetPath = join(UI_CHAT, target)
    if (!existsSync(targetPath)) fail(`官方源码路径不存在（升级后请核对）：${target}`)
    if (!touched.includes(target)) backup(target)
    let source = readFileSync(targetPath, 'utf8')
    for (const [find, replace] of edits) {
      const hits = occurrences(source, find)
      if (hits !== 1) fail(`${target}：锚点命中 ${hits} 次（应为 1 次），官方源码可能已变：\n${find.slice(0, 120)}`)
      source = source.replace(find, replace)
    }
    writeFileSync(targetPath, source, 'utf8')
  }

  for (const artifact of ARTIFACTS) backup(artifact)

  // 2. 构建（官方工具链、官方配置）
  const result = spawnSync(process.execPath, [TSDOWN, '--config', 'tsdown.config.ts'], {
    cwd: UI_CHAT,
    stdio: 'inherit',
  })
  if (result.status !== 0) fail(`官方 tsdown 构建失败（exit ${String(result.status)}）`)

  // 3. 取产物、校验标记、改 id、落到模组
  const builtPath = join(UI_CHAT, 'lib', 'client.js')
  if (!existsSync(builtPath)) fail('构建没有产出 lib/client.js')
  let built = readFileSync(builtPath, 'utf8')
  for (const marker of MARKERS) {
    if (!built.includes(marker)) fail(`构建产物里没有找到坚祥补丁标记 ${marker}：该补丁可能没生效`)
  }
  const banner = new RegExp(`window\\.__ModuleLoader__\\.load\\(\\{\\s*id: "${OFFICIAL_ID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`)
  if (!banner.test(built)) fail(`产物里找不到模块 id 注册行：${OFFICIAL_ID}`)
  built = built.replace(banner, `window.__ModuleLoader__.load({\n  id: "${MOD_ID}"`)
  built = built.replace(/\n\/\/# sourceMappingURL=client\.js\.map\s*$/, '\n')

  mkdirSync(join(PKG, 'lib'), { recursive: true })
  writeFileSync(join(PKG, 'lib', 'client.js'), built, 'utf8')
  console.log(`[build] ${MOD_ID} 已生成 lib/client.js（官方 ui-chat 源码 + 折叠时机/自动加载补丁）`)
} finally {
  // 4. 无论成败都恢复官方树
  restore()
}
