/**
 * Git 面板 —— 浏览器半边。
 *
 * 在右侧面板注册一个页类型标签页（stage one 注册类型、stage two 注册正文，共用同一个 id），
 * 并在会话 header 的 actions 槽放一个入口按钮：右侧面板的「加号」只开引导页，
 * 插件自己的页靠 ctx.sidebarRight.openTab(kind) 打开。
 *
 * 数据全部来自宿主半边 jxGit Remote（读数 + 本地暂存/取消暂存/提交 + AI 摘要）。
 * 视觉走自注入的 jxgit-* 样式表（tokens 优先、VS Code 风格状态色），悬停出逐文件
 * 暂存/取消暂存按钮；提交区是「信息框 + 两行按钮（AI 生成摘要并提交 / 按已输入提交）」；
 * 提交历史渲染成路线图（竖线 + 圆点）。diff 与路径全部作为 React 文本节点渲染（自动转义，
 * 绝不用 innerHTML）。不做 push/pull/丢弃更改这类动作。
 *
 * 只值导入平台基线模块（react）与 Cordis 服务，官方功能包一律不 import 值。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { TYPERT_REMOTE } from './remote-client.ts'
import { diffLineKind } from './diff-lines.ts'
import { en, NS, zh, type GitLocaleKey } from './locales.ts'

/** 标签页类型 id（两处 slot 注册共用）与判别名（openTab 点名用）。 */
const TAB_ID = 'dsh-git-panel'
const TAB_KIND = 'jxGitPanel'
/** 一次拉取的提交条数。 */
const HISTORY_LIMIT = 30
/** diff 折叠时先渲染的行数（大 diff 不一次性塞进 DOM）。 */
const COLLAPSED_LINES = 400
/** 注入样式表的 id（卸载时移除）。 */
const STYLE_ID = 'jx-git-panel-style'

type Locale = (key: GitLocaleKey) => string
type RemoteResult<T> = { ok: true, value: T } | { ok: false, error: { code: string, message: string } }

/** 宿主返回的一个改动文件。 */
interface GitFile {
  index: string
  worktree: string
  mark: string
  path: string
  original: string
}

interface RepoRef { path: string, name: string }

interface StatusValue {
  repos: RepoRef[]
  repo: string
  branch: string
  oid: string
  upstream: string
  ahead: number
  behind: number
  staged: GitFile[]
  unstaged: GitFile[]
  untracked: GitFile[]
  conflicted: GitFile[]
  truncated: boolean
  reason: string
}

interface DiffValue { text: string, truncated: boolean, binary: boolean, empty: boolean }

interface CommitRef { hash: string, short: string, author: string, time: string, subject: string }

interface LogValue { commits: CommitRef[], more: boolean, empty: boolean }

interface CommitValue { files: GitFile[], diff: DiffValue }

/** jxGit Remote 的浏览器面。 */
interface GitRemote {
  status(sessionId: string, repo: string): Promise<RemoteResult<StatusValue>>
  diff(sessionId: string, repo: string, path: string, staged: boolean): Promise<RemoteResult<DiffValue>>
  log(sessionId: string, repo: string, limit: number): Promise<RemoteResult<LogValue>>
  show(sessionId: string, repo: string, hash: string): Promise<RemoteResult<CommitValue>>
  stage(sessionId: string, repo: string, paths: string[]): Promise<RemoteResult<{ count: number }>>
  unstage(sessionId: string, repo: string, paths: string[]): Promise<RemoteResult<{ count: number }>>
  commit(sessionId: string, repo: string, message: string): Promise<RemoteResult<{ summary: string }>>
  summarize(sessionId: string, repo: string): Promise<RemoteResult<{ message: string }>>
}

/** tab 席位给组件的信息（结构最小面）。 */
interface TabInfo {
  sidebar: { expanded: boolean, fullscreen: boolean }
  panel: { id: string }
  tab: { visible: boolean, actions: { close: () => void }, signal: AbortSignal }
}

interface GitPanelProps {
  sessionId: string
  useTabInfo: () => TabInfo
  git: GitRemote
  t: Locale
}

interface GitEntryButtonProps {
  open: () => void
  t: Locale
}

/** 打开中的 diff / 提交详情。 */
type Opened =
  | { kind: 'file', key: string, phase: 'loading', label: string }
  | { kind: 'file', key: string, phase: 'ready', label: string, diff: DiffValue, untracked: boolean }
  | { kind: 'file', key: string, phase: 'error', label: string, error: string }
  | { kind: 'commit', key: string, phase: 'loading', label: string }
  | { kind: 'commit', key: string, phase: 'ready', label: string, commit: CommitValue }
  | { kind: 'commit', key: string, phase: 'error', label: string, error: string }

/** 分组名（与状态结果的三组 + 冲突对应）。 */
type GroupName = 'staged' | 'unstaged' | 'untracked' | 'conflicted'

/** 改动状态字母的着色（VS Code 源代码管理视图的惯例）。 */
const STATUS_COLORS: Record<string, string> = {
  A: '#3fb950', '?': '#3fb950',
  M: '#d29922', T: '#d29922',
  D: '#f85149', U: '#f85149',
  R: '#4493f8', C: '#39c5cf',
}

/** 注入的样式表（tokens 优先，回退到中性配色；暗色主题下 token 生效即自动跟随）。 */
const JXGIT_CSS = [
  '.jxgit{display:flex;flex-direction:column;height:100%;min-height:0;font-size:13px;',
  'color:var(--dsw-alias-label-primary,#1f2328);',
  '--jxg-quiet:var(--dsw-alias-label-tertiary,#8b949e);',
  '--jxg-line:var(--dsw-alias-border-l3,rgba(128,128,128,.3));',
  '--jxg-hover:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.14));',
  '--jxg-soft:color-mix(in srgb,currentColor 4%,transparent);',
  '--jxg-accent:var(--dsw-alias-label-link,#1f6feb);',
  '--jxg-mono:var(--dsh-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace)}',
  '.jxgit *{box-sizing:border-box}',
  '.jxgit-head{display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--jxg-line);flex:none;min-width:0}',
  '.jxgit-title{font-weight:600;flex:none}',
  '.jxgit-repo{flex:1;min-width:40px;max-width:100%;font-size:12px;color:inherit;padding:2px 4px;border:1px solid var(--jxg-line);border-radius:6px;background:transparent}',
  '.jxgit-iconbtn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:6px;background:transparent;color:var(--jxg-quiet);cursor:pointer;font-size:12px}',
  '.jxgit-iconbtn:hover{background:var(--jxg-hover);color:inherit}',
  '.jxgit-iconbtn:disabled{opacity:.5;cursor:default}',
  '.jxgit-body{flex:1;min-height:0;overflow-y:auto;padding:8px 10px 24px}',
  '.jxgit-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 8px;font-size:12px;color:var(--jxg-quiet)}',
  '.jxgit-chip{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:99px;border:1px solid var(--jxg-line);white-space:nowrap}',
  '.jxgit-chip.ok{color:#3fb950;border-color:rgba(63,185,80,.4)}',
  '.jxgit-chip.warn{color:#f85149;border-color:rgba(248,81,73,.4)}',
  '.jxgit-commit{margin:0 0 12px;display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid var(--jxg-line);border-radius:8px;background:var(--jxg-soft)}',
  '.jxgit-msg{width:100%;min-height:54px;resize:vertical;font:inherit;font-size:12px;line-height:18px;padding:6px 8px;border:1px solid var(--jxg-line);border-radius:6px;background:var(--dsw-alias-bg-base,transparent);color:inherit}',
  '.jxgit-msg:focus-visible{outline:1px solid var(--jxg-accent)}',
  '.jxgit-btn{width:100%;padding:5px 10px;border-radius:6px;font:inherit;font-size:12.5px;cursor:pointer}',
  '.jxgit-btn:disabled{opacity:.55;cursor:default}',
  '.jxgit-btn-primary{background:var(--jxg-accent);border:1px solid var(--jxg-accent);color:#fff}',
  '.jxgit-btn-primary:hover:not(:disabled){filter:brightness(1.12)}',
  '.jxgit-btn-second{background:transparent;border:1px solid var(--jxg-line);color:inherit}',
  '.jxgit-btn-second:hover:not(:disabled){background:var(--jxg-hover)}',
  '.jxgit-note{font-size:11.5px;color:var(--jxg-quiet)}',
  '.jxgit-err{font-size:11.5px;color:#f85149;word-break:break-all}',
  '.jxgit-ok{font-size:11.5px;color:#3fb950;word-break:break-all}',
  '.jxgit-sec{margin:0 0 8px}',
  '.jxgit-sechead{display:flex;align-items:center;gap:6px;padding:3px 2px;user-select:none;font-size:12px;color:var(--jxg-quiet)}',
  '.jxgit-caret{width:10px;flex:none;display:inline-block;color:var(--jxg-quiet)}',
  '.jxgit-secname{letter-spacing:.3px}',
  '.jxgit-count{display:inline-block;min-width:16px;text-align:center;font-size:10.5px;line-height:14px;padding:0 4px;border-radius:99px;background:var(--jxg-soft);color:var(--jxg-quiet)}',
  '.jxgit-secaction{margin-left:auto;display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border:1px solid var(--jxg-line);border-radius:6px;background:transparent;color:var(--jxg-quiet);font-size:11px;cursor:pointer;opacity:.75}',
  '.jxgit-secaction:hover{opacity:1;background:var(--jxg-hover);color:inherit}',
  '.jxgit-secaction:disabled{opacity:.4;cursor:default}',
  '.jxgit-file{display:flex;align-items:center;gap:6px;width:100%;padding:2px 4px 2px 18px;border:none;background:transparent;color:inherit;cursor:pointer;text-align:left;border-radius:6px;font-size:12.5px}',
  '.jxgit-file:hover,.jxgit-file.open{background:var(--jxg-hover)}',
  '.jxgit-mark{flex:none;width:14px;text-align:center;font-weight:600;font-family:var(--jxg-mono);font-size:12px}',
  '.jxgit-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}',
  '.jxgit-act{flex:none;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:none;border-radius:5px;background:transparent;color:var(--jxg-quiet);cursor:pointer;font-size:14px;line-height:1;opacity:0}',
  '.jxgit-file:hover .jxgit-act,.jxgit-act:focus-visible{opacity:1}',
  '.jxgit-act:hover{background:var(--jxg-accent);color:#fff}',
  '.jxgit-act:disabled{opacity:.35;cursor:default}',
  '.jxgit-detail{padding:2px 6px 10px 38px;display:flex;flex-direction:column;gap:6px}',
  '.jxgit-tl{margin-top:8px}',
  '.jxgit-tlhead{padding:4px 2px;font-size:12px;color:var(--jxg-quiet);user-select:none}',
  '.jxgit-node{position:relative;margin-left:5px;padding:0 0 0 16px;border-left:1px solid var(--jxg-line)}',
  '.jxgit-node:last-child{border-left-color:transparent}',
  '.jxgit-node::before{content:"";position:absolute;left:-4px;top:7px;width:7px;height:7px;border-radius:50%;background:var(--jxg-accent);box-shadow:0 0 0 2px var(--dsw-alias-bg-base,transparent)}',
  '.jxgit-node-main{padding:0 0 10px;min-width:0}',
  '.jxgit-node-title{display:flex;align-items:baseline;gap:6px;width:100%;padding:1px 2px;border:none;background:transparent;color:inherit;cursor:pointer;text-align:left;border-radius:6px;font-size:12.5px}',
  '.jxgit-node-title:hover{background:var(--jxg-hover)}',
  '.jxgit-hash{flex:none;font-family:var(--jxg-mono);font-size:11px;color:var(--jxg-accent)}',
  '.jxgit-sub{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.jxgit-meta{font-size:11px;color:var(--jxg-quiet);padding:1px 2px 0}',
  '.jxgit-diff{margin:2px 0;max-height:46vh;overflow:auto;font-family:var(--jxg-mono);font-size:11.5px;line-height:17px;border-radius:6px;background:var(--jxg-soft);padding:4px 0}',
  '.jxgit-dl{padding:0 8px;white-space:pre;min-height:17px}',
  '.jxgit-dl.add{color:#3fb950;background:color-mix(in srgb,#3fb950 12%,transparent)}',
  '.jxgit-dl.del{color:#f85149;background:color-mix(in srgb,#f85149 12%,transparent)}',
  '.jxgit-dl.hunk,.jxgit-dl.meta{color:var(--jxg-quiet)}',
  '.jxgit-files{display:flex;flex-direction:column;gap:1px}',
  '.jxgit-frow{display:flex;gap:6px;font-size:12px;padding:0 2px}',
  '.jxgit-link{align-self:flex-start;padding:1px 0;border:none;background:transparent;color:var(--jxg-accent);cursor:pointer;font-size:11.5px}',
  '.jxgit-link:hover{text-decoration:underline}',
].join('\n')

/** 状态字母的展示（porcelain 的 '.' 与空串按修改处理，保证有标记可看）。 */
function markOf(file: GitFile, group: GroupName): string {
  if (group === 'untracked') return '?'
  if (group === 'conflicted') return 'U'
  const letter = group === 'staged' ? file.index : file.worktree
  return letter === '.' || letter === ' ' || letter === '' ? 'M' : letter
}

/** ISO 时间 → 「MM-DD HH:mm」。 */
function fmtTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 逐行 diff 视图（React 文本节点渲染，自动转义）。 */
function DiffBlock({ diff, t, note }: { diff: DiffValue, t: Locale, note?: string }): ReactNode {
  const [expanded, setExpanded] = useState(false)
  const lines = useMemo(
    () => diff.text.split('\n').filter((line, index, all) => index < all.length - 1 || line !== ''),
    [diff.text],
  )
  const shown = expanded ? lines : lines.slice(0, COLLAPSED_LINES)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {note !== undefined && <div className="jxgit-note">{note}</div>}
      {diff.binary
        ? <div className="jxgit-note">{t('binary')}</div>
        : diff.empty
          ? <div className="jxgit-note">{t('emptyDiff')}</div>
          : (
            <pre className="jxgit-diff" data-jx-git-diff="">
              {shown.map((line, index) => (
                <div key={index} className={`jxgit-dl ${diffLineKind(line)}`}>{line === '' ? ' ' : line}</div>
              ))}
            </pre>
          )}
      {diff.truncated && <div className="jxgit-note">{t('truncated')}</div>}
      {lines.length > COLLAPSED_LINES && (
        <button type="button" className="jxgit-link" onClick={() => { setExpanded(value => !value) }}>
          {expanded ? t('collapse') : `${t('expand')}（${String(lines.length - COLLAPSED_LINES)} 行）`}
        </button>
      )}
    </div>
  )
}

/** 一行改动文件：状态字母 + 路径 + 悬停出现的暂存/取消暂存按钮。 */
function FileRow(props: {
  file: GitFile
  group: GroupName
  active: boolean
  busy: boolean
  onOpen: (file: GitFile, group: GroupName) => void
  onStage: (file: GitFile) => void
  onUnstage: (file: GitFile) => void
  t: Locale
}): ReactNode {
  const { file, group, active, busy } = props
  const mark = markOf(file, group)
  const label = file.original === '' ? file.path : `${file.original} → ${file.path}`
  const canStage = !busy && (group === 'unstaged' || group === 'untracked')
  const canUnstage = !busy && group === 'staged'
  return (
    <div
      className={`jxgit-file${active ? ' open' : ''}`}
      data-jx-git-file={file.path}
      role="button"
      tabIndex={-1}
      onClick={() => { if (group !== 'conflicted') props.onOpen(file, group) }}
      title={label}
    >
      <span className="jxgit-mark" style={{ color: STATUS_COLORS[mark] ?? 'var(--jxg-quiet)' }}>{mark}</span>
      <span className="jxgit-path">{label}</span>
      {canStage && (
        <span
          className="jxgit-act"
          title={props.t('stageFile')}
          onClick={event => { event.stopPropagation(); props.onStage(file) }}
        >+</span>
      )}
      {canUnstage && (
        <span
          className="jxgit-act"
          title={props.t('unstageFile')}
          onClick={event => { event.stopPropagation(); props.onUnstage(file) }}
        >−</span>
      )}
    </div>
  )
}

/** 会话 header 上的入口按钮（自带 SVG，不依赖官方图标名）。 */
function GitEntryButton({ open, t }: GitEntryButtonProps): ReactNode {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      data-jx-git-entry=""
      aria-label={t('entryHint')}
      title={t('entryHint')}
      onClick={open}
      onMouseEnter={() => { setHover(true) }}
      onMouseLeave={() => { setHover(false) }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '28px', height: '28px', padding: '6px', border: 'none', borderRadius: '28px',
        background: hover ? 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.14))' : 'transparent',
        color: 'var(--dsw-alias-label-secondary, #57606a)', cursor: 'pointer',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none">
          <circle cx="4.5" cy="3.5" r="1.8" />
          <circle cx="4.5" cy="12.5" r="1.8" />
          <circle cx="11.5" cy="6" r="1.8" />
          <path d="M4.5 5.3v5.4" />
          <path d="M9.7 6.9c-.9 1.4-2.4 2.1-4 2.1" />
        </g>
      </svg>
    </button>
  )
}

/** Git 面板正文。 */
function GitPanel({ sessionId, useTabInfo, git, t }: GitPanelProps): ReactNode {
  const info = useTabInfo()
  const visible = info.tab.visible
  const [status, setStatus] = useState<StatusValue | undefined>(undefined)
  const [history, setHistory] = useState<LogValue | undefined>(undefined)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [repo, setRepo] = useState('')
  const [tick, setTick] = useState(0)
  const [opened, setOpened] = useState<Opened | undefined>(undefined)
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  // 暂存/取消暂存进行中的标记（'all:分组名' 或 'file:路径'）。
  const [actionBusy, setActionBusy] = useState('')
  // 提交区状态。
  const [message, setMessage] = useState('')
  const [commitBusy, setCommitBusy] = useState<'' | 'ai' | 'typed'>('')
  const [commitError, setCommitError] = useState('')
  const [commitNote, setCommitNote] = useState('')
  const runId = useRef(0)

  // 打开面板、切仓库、手动刷新、页面重新可见时拉一次（不做文件监听）。
  useEffect(() => {
    const mine = ++runId.current
    setBusy(true)
    void (async () => {
      const found = await git.status(sessionId, repo)
      if (mine !== runId.current) return
      if (!found.ok) {
        setError(`${found.error.code}: ${found.error.message}`)
        setBusy(false)
        return
      }
      setStatus(found.value)
      setError('')
      setBusy(false)
      const logs = await git.log(sessionId, found.value.repo, HISTORY_LIMIT)
      if (mine !== runId.current) return
      if (logs.ok) setHistory(logs.value)
    })().catch((reason: unknown) => {
      if (mine !== runId.current) return
      setError(String(reason))
      setBusy(false)
    })
  }, [git, sessionId, repo, tick, visible])

  const refresh = useCallback((): void => {
    setOpened(undefined)
    setTick(value => value + 1)
  }, [])

  const openFile = useCallback((file: GitFile, group: GroupName): void => {
    const key = `${group}:${file.path}`
    if (opened?.key === key) {
      setOpened(undefined)
      return
    }
    setOpened({ kind: 'file', key, phase: 'loading', label: file.path })
    void git.diff(sessionId, status?.repo ?? '', file.path, group === 'staged').then(found => {
      setOpened(current => current?.key !== key
        ? current
        : found.ok
          ? { kind: 'file', key, phase: 'ready', label: file.path, diff: found.value, untracked: group === 'untracked' }
          : { kind: 'file', key, phase: 'error', label: file.path, error: `${found.error.code}: ${found.error.message}` })
    }).catch((reason: unknown) => {
      setOpened(current => current?.key !== key ? current : { kind: 'file', key, phase: 'error', label: file.path, error: String(reason) })
    })
  }, [git, opened, sessionId, status])

  const openCommit = useCallback((commit: CommitRef): void => {
    const key = `commit:${commit.hash}`
    if (opened?.key === key) {
      setOpened(undefined)
      return
    }
    setOpened({ kind: 'commit', key, phase: 'loading', label: commit.short })
    void git.show(sessionId, status?.repo ?? '', commit.hash).then(found => {
      setOpened(current => current?.key !== key
        ? current
        : found.ok
          ? { kind: 'commit', key, phase: 'ready', label: commit.short, commit: found.value }
          : { kind: 'commit', key, phase: 'error', label: commit.short, error: `${found.error.code}: ${found.error.message}` })
    }).catch((reason: unknown) => {
      setOpened(current => current?.key !== key ? current : { kind: 'commit', key, phase: 'error', label: commit.short, error: String(reason) })
    })
  }, [git, opened, sessionId, status])

  /** 暂存 / 取消暂存一组路径，成功后刷新状态。 */
  const runStage = useCallback((mode: 'stage' | 'unstage', paths: string[], key: string): void => {
    if (actionBusy !== '' || paths.length === 0) return
    setActionBusy(key)
    void (async () => {
      const found = mode === 'stage'
        ? await git.stage(sessionId, status?.repo ?? '', paths)
        : await git.unstage(sessionId, status?.repo ?? '', paths)
      setActionBusy('')
      if (!found.ok) {
        setError(`${found.error.code}: ${found.error.message}`)
        return
      }
      setTick(value => value + 1)
    })().catch((reason: unknown) => {
      setActionBusy('')
      setError(String(reason))
    })
  }, [actionBusy, git, sessionId, status])

  /** 提交：'ai' 先取摘要（回填输入框）再提交；'typed' 用输入框内容。 */
  const runCommit = useCallback((mode: 'ai' | 'typed'): void => {
    if (commitBusy !== '') return
    if (mode === 'typed' && message.trim() === '') {
      setCommitError(t('emptyMessage'))
      return
    }
    setCommitBusy(mode)
    setCommitError('')
    setCommitNote('')
    void (async () => {
      let text = message
      if (mode === 'ai') {
        const summary = await git.summarize(sessionId, status?.repo ?? '')
        if (!summary.ok) {
          setCommitBusy('')
          setCommitError(`${t('aiFailed')}：${summary.error.message}`)
          return
        }
        text = summary.value.message
        setMessage(text)
      }
      const outcome = await git.commit(sessionId, status?.repo ?? '', text)
      setCommitBusy('')
      if (!outcome.ok) {
        setCommitError(`${t('commitFailed')}：${outcome.error.message}`)
        return
      }
      setCommitNote(outcome.value.summary === '' ? t('committed') : outcome.value.summary)
      setMessage('')
      setOpened(undefined)
      setTick(value => value + 1)
    })().catch((reason: unknown) => {
      setCommitBusy('')
      setCommitError(String(reason))
    })
  }, [commitBusy, git, message, sessionId, status, t])

  const toggle = useCallback((name: string): void => {
    setClosed(current => ({ ...current, [name]: current[name] !== true }))
  }, [])

  const groups = useMemo(() => {
    if (status === undefined) return [] as Array<{ name: GroupName, label: string, files: GitFile[] }>
    return ([
      { name: 'conflicted', label: t('conflicted'), files: status.conflicted },
      { name: 'staged', label: t('staged'), files: status.staged },
      { name: 'unstaged', label: t('unstaged'), files: status.unstaged },
      { name: 'untracked', label: t('untracked'), files: status.untracked },
    ] as Array<{ name: GroupName, label: string, files: GitFile[] }>).filter(group => group.files.length > 0)
  }, [status, t])

  const changed = status === undefined ? 0
    : status.staged.length + status.unstaged.length + status.untracked.length + status.conflicted.length

  return (
    <div className="jxgit" data-jx-git-panel="">
      <div className="jxgit-head">
        <span className="jxgit-title">{t('tab')}</span>
        {status !== undefined && status.repo !== '' && status.repos.length > 1 && (
          <select
            className="jxgit-repo"
            data-jx-git-repo=""
            value={status.repo}
            onChange={event => { setOpened(undefined); setRepo(event.target.value) }}
          >
            {status.repos.map(candidate => <option key={candidate.path} value={candidate.path}>{candidate.name}</option>)}
          </select>
        )}
        {status !== undefined && status.repo !== '' && status.repos.length <= 1 && (
          <span className="jxgit-note" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {status.repos[0]?.name ?? status.repo}
          </span>
        )}
        <button type="button" className="jxgit-iconbtn" onClick={refresh} disabled={busy} title={t('refresh')} aria-label={t('refresh')}>⟳</button>
        <button type="button" className="jxgit-iconbtn" onClick={() => { info.tab.actions.close() }} title={t('close')} aria-label={t('close')}>✕</button>
      </div>

      <div className="jxgit-body">
        {error !== '' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
            <div className="jxgit-err">{t('failed')}</div>
            <div className="jxgit-err">{error}</div>
            <button type="button" className="jxgit-link" onClick={refresh}>{t('retry')}</button>
          </div>
        )}

        {error === '' && status !== undefined && status.repo === '' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div className="jxgit-note">{t('noRepo')}</div>
            <div className="jxgit-note" style={{ wordBreak: 'break-all' }}>{status.reason}</div>
          </div>
        )}

        {error === '' && status === undefined && <div className="jxgit-note">{t('loading')}</div>}

        {error === '' && status !== undefined && status.repo !== '' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="jxgit-bar">
              <span className="jxgit-chip">{status.branch === '' ? t('detached') : status.branch}</span>
              <span className="jxgit-chip">{status.upstream === ''
                ? t('upstreamNone')
                : `↑${String(status.ahead)} ↓${String(status.behind)} ${status.upstream}`}</span>
              <span className={`jxgit-chip${changed === 0 ? ' ok' : ' warn'}`}>
                {changed === 0 ? t('clean') : `${t('dirty')} ${String(changed)}`}
              </span>
            </div>

            <div className="jxgit-commit">
              <textarea
                className="jxgit-msg"
                value={message}
                placeholder={t('messagePlaceholder')}
                rows={3}
                onChange={event => { setMessage(event.target.value); setCommitError(''); setCommitNote('') }}
              />
              <button type="button" className="jxgit-btn jxgit-btn-primary" disabled={commitBusy !== ''}
                onClick={() => { runCommit('ai') }}>
                {commitBusy === 'ai' ? t('generating') : t('aiCommit')}
              </button>
              <button type="button" className="jxgit-btn jxgit-btn-second" disabled={commitBusy !== ''}
                onClick={() => { runCommit('typed') }}>
                {commitBusy === 'typed' ? t('committing') : t('typedCommit')}
              </button>
              {commitError !== '' && <div className="jxgit-err">{commitError}</div>}
              {commitNote !== '' && <div className="jxgit-ok">{commitNote}</div>}
            </div>

            {groups.map(group => {
              const open = closed[group.name] !== true
              const stageAll = group.name === 'unstaged' || group.name === 'untracked'
              const allPaths = group.files.map(file => file.path)
              return (
                <div key={group.name} className="jxgit-sec">
                  <div className="jxgit-sechead">
                    <div
                      className="jxgit-file"
                      style={{ padding: '2px 0 2px 2px', flex: 'none', width: 'auto' }}
                      role="button"
                      tabIndex={-1}
                      onClick={() => { toggle(group.name) }}
                      aria-expanded={open}
                    >
                      <span className="jxgit-caret">{open ? '▾' : '▸'}</span>
                      <span className="jxgit-secname">{group.label}</span>
                      <span className="jxgit-count">{String(group.files.length)}</span>
                    </div>
                    {group.name === 'staged' && (
                      <button type="button" className="jxgit-secaction" disabled={actionBusy !== ''}
                        onClick={() => { runStage('unstage', allPaths, `all:${group.name}`) }} title={t('unstageAll')}>
                        {actionBusy === `all:${group.name}` ? t('stageBusy') : `− ${t('unstageAll')}`}
                      </button>
                    )}
                    {stageAll && (
                      <button type="button" className="jxgit-secaction" disabled={actionBusy !== ''}
                        onClick={() => { runStage('stage', allPaths, `all:${group.name}`) }} title={t('stageAll')}>
                        {actionBusy === `all:${group.name}` ? t('stageBusy') : `+ ${t('stageAll')}`}
                      </button>
                    )}
                  </div>
                  {open && group.files.map(file => {
                    const key = `${group.name}:${file.path}`
                    return (
                      <div key={key} style={{ display: 'flex', flexDirection: 'column' }}>
                        <FileRow
                          file={file}
                          group={group.name}
                          active={opened?.key === key}
                          busy={actionBusy !== ''}
                          onOpen={openFile}
                          onStage={target => { runStage('stage', [target.path], `file:${target.path}`) }}
                          onUnstage={target => { runStage('unstage', [target.path], `file:${target.path}`) }}
                          t={t}
                        />
                        {opened?.key === key && (
                          <div className="jxgit-detail">
                            {opened.phase === 'loading' && <div className="jxgit-note">{t('loadingDiff')}</div>}
                            {opened.phase === 'error' && <div className="jxgit-err">{opened.error}</div>}
                            {opened.phase === 'ready' && (
                              <DiffBlock
                                diff={opened.diff}
                                t={t}
                                note={opened.untracked && !opened.diff.empty ? t('untrackedContent') : undefined}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}

            <div className="jxgit-tl">
              <div className="jxgit-tlhead">
                <div
                  className="jxgit-file"
                  style={{ padding: '2px 0', flex: 'none', width: 'auto' }}
                  role="button"
                  tabIndex={-1}
                  onClick={() => { toggle('history') }}
                  aria-expanded={closed.history !== true}
                >
                  <span className="jxgit-caret">{closed.history !== true ? '▾' : '▸'}</span>
                  <span className="jxgit-secname">{t('history')}</span>
                  <span className="jxgit-count">{String(history?.commits.length ?? 0)}</span>
                </div>
              </div>
              {closed.history !== true && (
                <>
                  {history !== undefined && history.empty && <div className="jxgit-note" style={{ padding: '2px 4px' }}>{t('emptyRepo')}</div>}
                  {(history?.commits ?? []).map(commit => (
                    <div key={commit.hash} className="jxgit-node">
                      <div className="jxgit-node-main">
                        <button type="button" className="jxgit-node-title" data-jx-git-commit={commit.short}
                          onClick={() => { openCommit(commit) }}>
                          <span className="jxgit-hash">{commit.short}</span>
                          <span className="jxgit-sub">{commit.subject}</span>
                        </button>
                        <div className="jxgit-meta">{commit.author} · {fmtTime(commit.time)}</div>
                        {opened?.key === `commit:${commit.hash}` && (
                          <div className="jxgit-detail" style={{ paddingLeft: '2px' }}>
                            {opened.phase === 'loading' && <div className="jxgit-note">{t('loadingDiff')}</div>}
                            {opened.phase === 'error' && <div className="jxgit-err">{opened.error}</div>}
                            {opened.phase === 'ready' && (
                              <>
                                <div className="jxgit-note">{t('filesChanged')}（{String(opened.commit.files.length)}）</div>
                                <div className="jxgit-files">
                                  {opened.commit.files.map(file => {
                                    const mark = file.index === '.' || file.index === '' ? 'M' : file.index
                                    return (
                                      <div key={`${file.index}:${file.path}`} className="jxgit-frow">
                                        <span className="jxgit-mark" style={{ color: STATUS_COLORS[mark] ?? 'var(--jxg-quiet)' }}>{mark}</span>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {file.original === '' ? file.path : `${file.original} → ${file.path}`}
                                        </span>
                                      </div>
                                    )
                                  })}
                                </div>
                                <DiffBlock diff={opened.commit.diff} t={t} />
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {history !== undefined && history.more && <div className="jxgit-note" style={{ padding: '2px 4px' }}>{t('more')}</div>}
                </>
              )}
            </div>

            {status.truncated && <div className="jxgit-note">{t('truncated')}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

/** 顶层插件先挂 jxGit Remote 命名空间（服务由 $mount 产生，不能写进顶层 inject）。 */
export const inject = ['remote']

/** 挂载 Remote、注册标签页类型与正文、装上样式表与会话 header 入口按钮。 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeMount = await ctx.remote.$mount(TYPERT_REMOTE)

  // 样式表：装进 head，卸载时精确移除（幂等：重复挂载共用同一份）。
  let style = document.getElementById(STYLE_ID)
  if (style === null) {
    style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = JXGIT_CSS
    document.head.append(style)
  }

  const disposeUi = ctx.plugin({
    name: 'dsh-git-panel/ui',
    inject: ['slots', 'locale', 'remote.jxGit', 'sidebarRightTabs', 'sidebarRight'],
    apply(child: ClientContext) {
      child.effect(() => child.locale.register(NS, { zh, en }), 'dsh-git-panel: dictionaries')
      const scoped = child as unknown as {
        locale: { bind: (ns: string) => Locale }
        remote: { jxGit: GitRemote }
        slots: {
          inject: (name: string, factory: () => unknown) => void
          register: (options: Record<string, unknown>, component: unknown) => unknown
        }
        sidebarRight: { openTab: (kind: string, options?: Record<string, unknown>) => void }
        sidebarRightTabs: { register: (definition: Record<string, unknown>) => () => void }
      }
      const t = scoped.locale.bind(NS)

      // stage one：页类型（不给 patterns = 按 kind 打开的普通页；不给 multiple = 每格一页）。
      child.effect(() => scoped.sidebarRightTabs.register({
        id: TAB_ID,
        kind: TAB_KIND,
        title: () => t('tab'),
      }), 'dsh-git-panel: tab type')

      // stage two：正文（key 必须等于类型的 id）。
      scoped.slots.inject('sidebar.right.pane.tab', () => scoped.slots.register({
        name: 'sidebar.right.pane.tab',
        key: TAB_ID,
        locale: NS,
        inject: () => ({ git: scoped.remote.jxGit, t }),
      }, GitPanel))

      // 入口：会话 header 的按钮（右侧面板的「加号」只开引导页，插件的页得自己开）。
      scoped.slots.inject('conversation.session.header.actions', () => scoped.slots.register({
        name: 'conversation.session.header.actions',
        id: TAB_ID,
        order: 40,
        locale: NS,
        inject: () => ({
          open: () => {
            try {
              scoped.sidebarRight.openTab(TAB_KIND)
            } catch {
              // 没有挂载的会话面时 openTab 会抛错（页面还没进入会话）；按钮本就只长在会话 header 上，
              // 竞态窗口里点空一次不打扰用户，下次点击即可。
            }
          },
          t,
        }),
      }, GitEntryButton))
    },
  })

  return async () => {
    await disposeUi()
    await disposeMount()
    style?.remove()
  }
}
