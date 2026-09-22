/**
 * Git 面板 —— 浏览器半边。
 *
 * 在右侧面板注册一个页类型标签页（stage one 注册类型、stage two 注册正文，共用同一个 id），
 * 并在会话 header 的 actions 槽放一个入口按钮：右侧面板的「加号」只开引导页，
 * 插件自己的页靠 ctx.sidebarRight.openTab(kind) 打开。
 *
 * 数据全部来自宿主半边 jxGit Remote（只读 git 命令）；这里只做呈现：
 * 分支/上游领先落后、四组改动文件、点开看逐行 diff、提交历史与单次提交的文件与 diff。
 * v1 没有任何写操作按钮（提交/推送/回滚一律不做）。
 *
 * 只值导入平台基线模块（react）与 Cordis 服务，官方功能包一律不 import 值。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { TYPERT_REMOTE } from './remote-client.ts'
import { diffLineKind, type DiffLineKind } from './diff-lines.ts'
import { en, NS, zh, type GitLocaleKey } from './locales.ts'

/** 标签页类型 id（两处 slot 注册共用）与判别名（openTab 点名用）。 */
const TAB_ID = 'dsh-git-panel'
const TAB_KIND = 'jxGitPanel'
/** 一次拉取的提交条数。 */
const HISTORY_LIMIT = 30
/** diff 折叠时先渲染的行数（大 diff 不一次性塞进 DOM）。 */
const COLLAPSED_LINES = 400

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

const TOKENS = {
  text: 'var(--dsw-alias-label-primary, #1f2328)',
  secondary: 'var(--dsw-alias-label-secondary, #57606a)',
  tertiary: 'var(--dsw-alias-label-tertiary, #6e7781)',
  border: 'var(--dsw-alias-border-l3, rgba(128,128,128,0.28))',
  hover: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))',
  surface: 'var(--dsw-alias-bg-base, transparent)',
  add: 'var(--dsw-alias-state-success-primary, #2da44e)',
  del: 'var(--dsw-alias-state-error-primary, #cf222e)',
  hunk: 'var(--dsw-alias-label-tertiary, #6e7781)',
  mono: 'var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)',
} as const

/** 改动状态字母的配色。 */
function markColor(mark: string): string {
  if (mark === 'A' || mark === '??') return TOKENS.add
  if (mark === 'D') return TOKENS.del
  if (mark === 'U') return TOKENS.del
  return TOKENS.secondary
}

/** diff 一行的前景色与底色。 */
function lineStyle(kind: DiffLineKind): { color: string, background?: string } {
  if (kind === 'add') return { color: TOKENS.add, background: 'color-mix(in srgb, currentColor 10%, transparent)' }
  if (kind === 'del') return { color: TOKENS.del, background: 'color-mix(in srgb, currentColor 10%, transparent)' }
  if (kind === 'hunk') return { color: TOKENS.hunk }
  if (kind === 'meta') return { color: TOKENS.tertiary }
  return { color: TOKENS.text }
}

/** 逐行 diff 视图：只读文本节点渲染（React 自动转义，绝不用 innerHTML）。 */
function DiffBlock({ diff, t, note }: { diff: DiffValue, t: Locale, note?: string }): ReactNode {
  const [expanded, setExpanded] = useState(false)
  const lines = useMemo(() => diff.text.split('\n').filter((line, index, all) => index < all.length - 1 || line !== ''), [diff.text])
  const shown = expanded ? lines : lines.slice(0, COLLAPSED_LINES)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {note !== undefined && <div style={{ fontSize: '12px', color: TOKENS.tertiary }}>{note}</div>}
      {diff.binary
        ? <div style={{ fontSize: '12px', color: TOKENS.tertiary }}>{t('binary')}</div>
        : diff.empty
          ? <div style={{ fontSize: '12px', color: TOKENS.tertiary }}>{t('emptyDiff')}</div>
          : (
            <pre
              data-jx-git-diff=""
              style={{
                margin: 0, padding: '6px 0', maxHeight: '46vh', overflow: 'auto',
                fontFamily: TOKENS.mono, fontSize: '12px', lineHeight: '18px',
                background: 'color-mix(in srgb, currentColor 4%, transparent)', borderRadius: '6px',
              }}
            >
              {shown.map((line, index) => (
                <div key={index} style={{ padding: '0 8px', whiteSpace: 'pre', ...lineStyle(diffLineKind(line)) }}>{line === '' ? ' ' : line}</div>
              ))}
            </pre>
          )}
      {diff.truncated && <div style={{ fontSize: '12px', color: TOKENS.tertiary }}>{t('truncated')}</div>}
      {lines.length > COLLAPSED_LINES && (
        <button type="button" onClick={() => { setExpanded(value => !value) }} style={linkButtonStyle}>
          {expanded ? t('collapse') : `${t('expand')}（${String(lines.length - COLLAPSED_LINES)} 行）`}
        </button>
      )}
    </div>
  )
}

const linkButtonStyle = {
  alignSelf: 'flex-start', padding: '2px 0', border: 'none', background: 'transparent',
  color: 'var(--dsw-alias-label-link, #0969da)', cursor: 'pointer', fontSize: '12px',
} as const

const rowStyle = {
  display: 'flex', alignItems: 'center', gap: '6px', width: '100%', padding: '4px 6px',
  border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer',
  textAlign: 'left', fontSize: '13px', borderRadius: '6px',
} as const

/** 分组标题（可折叠）。 */
function SectionTitle({ label, count, open, toggle }: { label: string, count: number, open: boolean, toggle: () => void }): ReactNode {
  return (
    <button type="button" onClick={toggle} style={{ ...rowStyle, color: TOKENS.secondary, fontSize: '12px', letterSpacing: '0.3px' }}>
      <span style={{ width: '10px', display: 'inline-block' }}>{open ? '▾' : '▸'}</span>
      <span>{label}</span>
      <span style={{ color: TOKENS.tertiary }}>{String(count)}</span>
    </button>
  )
}

/** 一个改动文件行。 */
function FileRow({ file, staged, mark, active, onOpen, t }: {
  file: GitFile
  staged: boolean
  mark: string
  active: boolean
  onOpen: (file: GitFile, staged: boolean) => void
  t: Locale
}): ReactNode {
  return (
    <button
      type="button"
      data-jx-git-file={file.path}
      onClick={() => { onOpen(file, staged) }}
      title={active ? t('collapse') : t('expand')}
      style={{ ...rowStyle, background: active ? TOKENS.hover : 'transparent' }}
    >
      <span style={{ color: markColor(mark), fontFamily: TOKENS.mono, width: '22px', flex: 'none' }}>{mark}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'left' }}>
        {file.original === '' ? file.path : `${file.original} → ${file.path}`}
      </span>
    </button>
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
        background: hover ? TOKENS.hover : 'transparent', color: TOKENS.secondary, cursor: 'pointer',
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

  const openFile = useCallback((file: GitFile, staged: boolean): void => {
    const key = `${staged ? 'index' : 'worktree'}:${file.path}`
    if (opened?.key === key) {
      setOpened(undefined)
      return
    }
    setOpened({ kind: 'file', key, phase: 'loading', label: file.path })
    void git.diff(sessionId, status?.repo ?? '', file.path, staged).then(found => {
      setOpened(current => current?.key !== key
        ? current
        : found.ok
          ? { kind: 'file', key, phase: 'ready', label: file.path, diff: found.value, untracked: !staged && file.mark === '??' }
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

  const toggle = useCallback((name: string): void => {
    setClosed(current => ({ ...current, [name]: current[name] !== true }))
  }, [])

  const groups = useMemo(() => {
    if (status === undefined) return []
    return [
      { name: 'conflicted', label: t('conflicted'), files: status.conflicted, mark: (file: GitFile) => file.index === 'U' ? 'U' : file.index },
      { name: 'staged', label: t('staged'), files: status.staged, mark: (file: GitFile) => file.index },
      { name: 'unstaged', label: t('unstaged'), files: status.unstaged, mark: (file: GitFile) => file.worktree },
      { name: 'untracked', label: t('untracked'), files: status.untracked, mark: () => '??' },
    ].filter(group => group.files.length > 0)
  }, [status, t])

  const changed = status === undefined ? 0 : status.staged.length + status.unstaged.length + status.untracked.length + status.conflicted.length

  return (
    <div data-jx-git-panel="" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, fontSize: '13px', color: TOKENS.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', borderBottom: `0.5px solid ${TOKENS.border}`, flex: 'none' }}>
        <span style={{ fontWeight: 500, flex: 'none' }}>{t('tab')}</span>
        {status !== undefined && status.repo !== '' && (
          <span style={{ color: TOKENS.tertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {status.repo}
            {status.branch === '' ? ` · ${t('detached')}` : ` · ${status.branch}`}
            {status.upstream === ''
              ? ''
              : ` · ↑${String(status.ahead)} ↓${String(status.behind)}`}
          </span>
        )}
        <button type="button" onClick={() => { setTick(value => value + 1) }} disabled={busy} style={{ ...linkButtonStyle, color: TOKENS.secondary, flex: 'none' }}>
          {busy ? t('loading') : t('refresh')}
        </button>
        <button type="button" onClick={() => { info.tab.actions.close() }} style={{ ...linkButtonStyle, color: TOKENS.secondary, flex: 'none' }}>
          {t('close')}
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 8px 16px' }}>
        {error !== '' && (
          <div style={{ color: TOKENS.del, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div>{t('failed')}</div>
            <div style={{ wordBreak: 'break-all', color: TOKENS.secondary }}>{error}</div>
            <button type="button" onClick={() => { setTick(value => value + 1) }} style={linkButtonStyle}>{t('retry')}</button>
          </div>
        )}

        {error === '' && status !== undefined && status.repo === '' && (
          <div style={{ color: TOKENS.secondary, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div>{t('noRepo')}</div>
            <div style={{ wordBreak: 'break-all', fontSize: '12px', color: TOKENS.tertiary }}>{status.reason}</div>
          </div>
        )}

        {error === '' && status !== undefined && status.repo !== '' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {status.repos.length > 1 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: TOKENS.secondary }}>
                <span>{t('repo')}</span>
                <select
                  data-jx-git-repo=""
                  value={status.repo}
                  onChange={event => { setOpened(undefined); setRepo(event.target.value) }}
                  style={{ flex: 1, minWidth: 0, padding: '2px 4px', fontSize: '12px', color: TOKENS.text, background: TOKENS.surface, border: `0.5px solid ${TOKENS.border}`, borderRadius: '6px' }}
                >
                  {status.repos.map(candidate => <option key={candidate.path} value={candidate.path}>{candidate.name}（{candidate.path}）</option>)}
                </select>
              </label>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '12px', color: TOKENS.secondary }}>
              <span>{status.branch === '' ? t('detached') : status.branch}</span>
              <span>·</span>
              <span>{status.upstream === '' ? t('upstreamNone') : `${status.upstream} ↑${String(status.ahead)} ↓${String(status.behind)}`}</span>
              <span>·</span>
              <span style={{ color: changed === 0 ? TOKENS.add : TOKENS.del }}>{changed === 0 ? t('clean') : `${t('dirty')}（${String(changed)}）`}</span>
            </div>

            {changed === 0 && status.staged.length + status.unstaged.length + status.untracked.length + status.conflicted.length === 0 && (
              <div style={{ fontSize: '12px', color: TOKENS.tertiary }}>{t('clean')}</div>
            )}

            {groups.map(group => (
              <div key={group.name} style={{ display: 'flex', flexDirection: 'column' }}>
                <SectionTitle
                  label={group.label}
                  count={group.files.length}
                  open={closed[group.name] !== true}
                  toggle={() => { toggle(group.name) }}
                />
                {closed[group.name] !== true && group.files.map(file => {
                  const staged = group.name === 'staged'
                  const key = `${staged ? 'index' : 'worktree'}:${file.path}`
                  return (
                    <div key={`${group.name}:${file.path}`} style={{ display: 'flex', flexDirection: 'column' }}>
                      <FileRow
                        file={file}
                        staged={staged}
                        mark={group.mark(file)}
                        active={opened?.key === key}
                        onOpen={openFile}
                        t={t}
                      />
                      {opened?.key === key && (
                        <div style={{ padding: '4px 6px 10px 28px' }}>
                          {opened.phase === 'loading' && <div style={{ fontSize: '12px', color: TOKENS.tertiary }}>{t('loadingDiff')}</div>}
                          {opened.phase === 'error' && <div style={{ fontSize: '12px', color: TOKENS.del, wordBreak: 'break-all' }}>{opened.error}</div>}
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
            ))}

            <div style={{ display: 'flex', flexDirection: 'column', marginTop: '4px', borderTop: `0.5px solid ${TOKENS.border}`, paddingTop: '6px' }}>
              <SectionTitle label={t('history')} count={history?.commits.length ?? 0} open={closed.history !== true} toggle={() => { toggle('history') }} />
              {closed.history !== true && (
                <>
                  {history !== undefined && history.empty && <div style={{ fontSize: '12px', color: TOKENS.tertiary, padding: '2px 6px' }}>{t('emptyRepo')}</div>}
                  {(history?.commits ?? []).map(commit => (
                    <div key={commit.hash} style={{ display: 'flex', flexDirection: 'column' }}>
                      <button
                        type="button"
                        data-jx-git-commit={commit.short}
                        onClick={() => { openCommit(commit) }}
                        style={{ ...rowStyle, background: opened?.key === `commit:${commit.hash}` ? TOKENS.hover : 'transparent', alignItems: 'baseline' }}
                      >
                        <span style={{ fontFamily: TOKENS.mono, color: TOKENS.tertiary, flex: 'none' }}>{commit.short}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{commit.subject}</span>
                        <span style={{ color: TOKENS.tertiary, fontSize: '12px', flex: 'none' }}>{commit.author}</span>
                      </button>
                      {opened?.key === `commit:${commit.hash}` && (
                        <div style={{ padding: '4px 6px 10px 28px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ fontSize: '12px', color: TOKENS.tertiary }}>{commit.time}</div>
                          {opened.phase === 'loading' && <div style={{ fontSize: '12px', color: TOKENS.tertiary }}>{t('loadingDiff')}</div>}
                          {opened.phase === 'error' && <div style={{ fontSize: '12px', color: TOKENS.del, wordBreak: 'break-all' }}>{opened.error}</div>}
                          {opened.phase === 'ready' && (
                            <>
                              <div style={{ fontSize: '12px', color: TOKENS.secondary }}>{t('filesChanged')}（{String(opened.commit.files.length)}）</div>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {opened.commit.files.map(file => (
                                  <div key={`${file.index}:${file.path}`} style={{ display: 'flex', gap: '6px', fontSize: '12px', padding: '1px 0' }}>
                                    <span style={{ color: markColor(file.index), fontFamily: TOKENS.mono, width: '22px', flex: 'none' }}>{file.index}</span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.original === '' ? file.path : `${file.original} → ${file.path}`}</span>
                                  </div>
                                ))}
                              </div>
                              <DiffBlock diff={opened.commit.diff} t={t} />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {history !== undefined && history.more && <div style={{ fontSize: '12px', color: TOKENS.tertiary, padding: '2px 6px' }}>{t('more')}</div>}
                </>
              )}
            </div>

            {status.truncated && <div style={{ fontSize: '12px', color: TOKENS.tertiary }}>{t('truncated')}</div>}
          </div>
        )}

        {error === '' && status === undefined && <div style={{ color: TOKENS.tertiary }}>{t('loading')}</div>}
      </div>
    </div>
  )
}

/** 顶层插件先挂 jxGit Remote 命名空间（服务由 $mount 产生，不能写进顶层 inject）。 */
export const inject = ['remote']

/** 挂载 Remote、注册标签页类型与正文、装上会话 header 入口按钮。 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeMount = await ctx.remote.$mount(TYPERT_REMOTE)

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
  }
}
