/**
 * 坚祥 Git 面板 —— 宿主半边（只读）。
 *
 * 执行缝用官方 `ctx.subprocess`（显式 argv、永不过 shell、输出上限、AbortSignal 超时），
 * 不使用 `ctx.shell`（它只吃命令字符串并强制套沙箱）。白名单子命令只有
 * `rev-parse` / `status` / `diff` / `log` / `show` 五个读数命令，**没有任何写操作**；
 * `repo` 参数只能取本服务自己扫描出的候选仓库根，浏览器给不出任意路径。
 *
 * 工作目录由 sessionId 解析（活会话 header.cwd），仓库识别照官方
 * `workspace-changes` 的 `rev-parse --show-toplevel` 配方（该包不导出可复用 API）。
 */
import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  addedTextDiff, capText, diffIsBinary, findRepositories, groupStatus, LOG_FIELD_SEPARATOR,
  LOG_RECORD_SEPARATOR, parseLog, parseNameStatus, parseStatusV2, repositoryName,
  type GitFileEntry, type GitRepoRef,
} from './git.ts'

/** 单条 git 命令的超时（只读命令；仓库很大时 status 也可能慢）。 */
const GIT_TIMEOUT_MS = 15_000
/** stdout 保留上限：超过即标记 truncated（diff 在服务端另有更小的展示上限）。 */
const GIT_STDOUT_MAX_BYTES = 4 * 1024 * 1024
/** stderr 尾巴（只要错误原因）。 */
const GIT_STDERR_MAX_BYTES = 16 * 1024
/** 终止宽限：先礼后兵，给 git 收尾的时间。 */
const TERMINATE_GRACE_MS = 2_000
/** 单次 diff / 伪 diff 返回给浏览器的文本上限。 */
const DIFF_MAX_BYTES = 200 * 1024
/** 未跟踪文件的伪 diff 行数上限。 */
const ADDED_DIFF_MAX_LINES = 4000
/** 状态列表条目上限（防御极端仓库把界面拖死）。 */
const STATUS_MAX_ENTRIES = 1000
/** 提交历史默认/上限条数。 */
const LOG_DEFAULT = 30
const LOG_MAX = 100
/** 候选仓库扫描结果的缓存时长。 */
const SCAN_TTL_MS = 10_000

/** 宿主 `ctx.subprocess` 的最小使用面（结构化，不引运行期类型）。 */
interface SubprocessFace {
  resolveExecutable(command: string, env?: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<string>
  spawn(spec: {
    argv: readonly string[]
    cwd: string
    stdio: {
      stdin: 'ignore'
      stdout: { maxBytes: number }
      stderr: { maxBytes: number }
    }
    graceMs: number
    signal?: AbortSignal
    env?: NodeJS.ProcessEnv
  }): {
    done: Promise<{ exitCode: number | null }>
    collected: {
      stdout?: { readFrom(offset: number): { text: string, lossy: boolean } }
      stderr?: { readFrom(offset: number): { text: string, lossy: boolean } }
    }
    terminate(): void
  }
}

/** 宿主 sessions 服务的最小使用面。 */
interface SessionsFace {
  get(id: string): { header: { cwd?: string } } | undefined
}

/** 一条只读 git 命令的结果。 */
interface GitRun {
  exitCode: number | null
  stdout: string
  stderr: string
  truncated: boolean
}

/** status 的 RPC 结果。 */
export interface JxGitStatusResult {
  /** 可切换的候选仓库（当前仓库在最前）。 */
  repos: GitRepoRef[]
  /** 当前仓库根；空串表示没识别到仓库。 */
  repo: string
  branch: string
  oid: string
  upstream: string
  ahead: number
  behind: number
  staged: GitFileEntry[]
  unstaged: GitFileEntry[]
  untracked: GitFileEntry[]
  conflicted: GitFileEntry[]
  /** 状态列表被上限截断。 */
  truncated: boolean
  /** 没有仓库时的人话原因（有仓库时为空串）。 */
  reason: string
}

/** 单个文件 diff 的 RPC 结果。 */
export interface JxGitDiffResult {
  text: string
  truncated: boolean
  binary: boolean
  /** 没有任何可展示内容（例如空的未跟踪文件）。 */
  empty: boolean
}

/** 提交历史一页。 */
export interface JxGitLogResult {
  commits: Array<{ hash: string, short: string, author: string, time: string, subject: string }>
  /** 还有更早的提交（本次只回了前 limit 条）。 */
  more: boolean
  /** 仓库还没有任何提交。 */
  empty: boolean
}

/** 单次提交的文件清单与 diff。 */
export interface JxGitCommitResult {
  files: GitFileEntry[]
  diff: JxGitDiffResult
}

/** 一次仓库扫描结果。 */
interface ScanEntry {
  cwd: string
  at: number
  repos: GitRepoRef[]
}

export class JxGitGateway extends TypertRemoteService {
  static inject = ['subprocess', 'sessions']

  private readonly scans = new Map<string, ScanEntry>()

  constructor(ctx: Context) {
    super(ctx, 'jxGit')
  }

  /** 官方子进程缝。 */
  private get subprocess(): SubprocessFace {
    return (this.ctx as unknown as { subprocess: SubprocessFace }).subprocess
  }

  /**
   * sessionId → 会话工作目录。
   * @param sessionId - 目标会话。
   * @returns 绝对路径。
   */
  private sessionCwd(sessionId: string): string {
    const cwd = (this.ctx as unknown as { sessions: SessionsFace }).sessions.get(sessionId)?.header.cwd
    if (cwd === undefined || cwd === '') {
      throw new Error(`会话 ${sessionId} 没有工作目录，无法显示 git 信息（该会话可能已被关闭或清理）。`)
    }
    return cwd
  }

  /**
   * 跑一条只读 git 命令。
   * @param cwd - 工作目录（必须是仓库内路径）。
   * @param args - 白名单子命令参数（argv 数组，永不过 shell）。
   * @param signal - 浏览器侧取消信号。
   * @returns 退出码、stdout/stderr 文本与截断标记。
   */
  private async runGit(cwd: string, args: readonly string[], signal?: AbortSignal): Promise<GitRun> {
    const subprocess = this.subprocess
    const executable = await subprocess.resolveExecutable('git', undefined, signal)
    const timeout = AbortSignal.timeout(GIT_TIMEOUT_MS)
    const fused = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
    const handle = subprocess.spawn({
      argv: [executable, ...args],
      cwd,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: GIT_STDOUT_MAX_BYTES },
        stderr: { maxBytes: GIT_STDERR_MAX_BYTES },
      },
      graceMs: TERMINATE_GRACE_MS,
      signal: fused,
      // 只读环境：不吃环境里的 git 配置、不弹凭据提示、不抢 index 锁。
      env: { GIT_CONFIG_COUNT: '0', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' },
    })
    const outcome = await handle.done
    if (fused.aborted) {
      throw new Error(timeout.aborted
        ? `git ${args.join(' ')} 超过 ${GIT_TIMEOUT_MS}ms 未结束，已终止。`
        : 'git 调用已取消。')
    }
    const stdout = handle.collected.stdout?.readFrom(0)
    const stderr = handle.collected.stderr?.readFrom(0)
    return {
      exitCode: outcome.exitCode,
      stdout: stdout?.text ?? '',
      stderr: stderr?.text ?? '',
      truncated: stdout?.lossy ?? false,
    }
  }

  /**
   * 目录所属仓库根。
   * @param cwd - 起始目录。
   * @param signal - 取消信号。
   * @returns 仓库根绝对路径；不在仓库内为 undefined。
   */
  private async repositoryRoot(cwd: string, signal?: AbortSignal): Promise<string | undefined> {
    const found = await this.runGit(cwd, ['rev-parse', '--show-toplevel'], signal)
    if (found.exitCode === 128 && /not a git repository/i.test(found.stderr)) return undefined
    if (found.exitCode !== 0) {
      throw new Error(`git rev-parse 失败（退出码 ${String(found.exitCode)}）：${found.stderr.trim()}`)
    }
    const root = found.stdout.trim()
    return root === '' ? undefined : root
  }

  /**
   * 候选仓库：cwd 所属仓库优先，其次扫描它周围（上一级目录向下两层）发现并列仓库。
   * @param sessionId - 缓存键。
   * @param cwd - 会话工作目录。
   * @param signal - 取消信号。
   * @returns 候选仓库列表（可能为空）。
   */
  private async candidates(sessionId: string, cwd: string, signal?: AbortSignal): Promise<GitRepoRef[]> {
    const cached = this.scans.get(sessionId)
    if (cached !== undefined && cached.cwd === cwd && Date.now() - cached.at < SCAN_TTL_MS) return cached.repos
    const own = await this.repositoryRoot(cwd, signal)
    const base = own === undefined ? cwd : dirname(own)
    const paths = [own ?? '', ...findRepositories(base, 2)].filter(path => path !== '')
    const seen = new Set<string>()
    const repos: GitRepoRef[] = []
    for (const path of paths) {
      const key = path.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      repos.push({ path, name: repositoryName(path) })
    }
    this.scans.set(sessionId, { cwd, at: Date.now(), repos })
    return repos
  }

  /**
   * 校验并解析浏览器传来的仓库参数。
   * @param sessionId - 目标会话。
   * @param repo - 浏览器选中的仓库根（空串表示默认）。
   * @param signal - 取消信号。
   * @returns 会话工作目录、选中仓库根与候选列表；没有仓库时 root 为空串。
   */
  private async resolveRepo(sessionId: string, repo: string, signal?: AbortSignal): Promise<{ cwd: string, root: string, repos: GitRepoRef[] }> {
    const cwd = this.sessionCwd(sessionId)
    const repos = await this.candidates(sessionId, cwd, signal)
    // 只接受候选列表里的路径：浏览器无法借此读取任意目录的仓库。
    const selected = repos.find(candidate => candidate.path === repo)
    return { cwd, root: selected?.path ?? repos[0]?.path ?? '', repos }
  }

  /**
   * 当前会话仓库的状态：分支、领先/落后、分组改动与候选仓库列表。
   * @param sessionId - 目标会话 id。
   * @param repo - 选中的仓库根（空串=默认仓库）。
   * @param signal - 浏览器侧取消信号（网关按位置识别，必须是最后一个参数）。
   * @returns 状态结果。
   */
  async status(sessionId: string, repo: string, signal?: AbortSignal): Promise<JxGitStatusResult> {
    const { cwd, root, repos } = await this.resolveRepo(sessionId, repo, signal)
    if (root === '') {
      return {
        repos, repo: '', branch: '', oid: '', upstream: '', ahead: 0, behind: 0,
        staged: [], unstaged: [], untracked: [], conflicted: [], truncated: false,
        reason: `当前会话目录不是 git 仓库：${cwd}`,
      }
    }
    const found = await this.runGit(root, ['status', '--porcelain=v2', '--branch', '-z'], signal)
    if (found.exitCode !== 0) {
      throw new Error(`git status 失败（退出码 ${String(found.exitCode)}）：${found.stderr.trim()}`)
    }
    const parsed = parseStatusV2(found.stdout)
    const groups = groupStatus(parsed.entries)
    const overLimit = parsed.entries.length > STATUS_MAX_ENTRIES
    const limit = (list: readonly GitFileEntry[]): GitFileEntry[] => list.slice(0, STATUS_MAX_ENTRIES)
    return {
      repos,
      repo: root,
      branch: parsed.branch === '(detached)' ? '' : parsed.branch,
      oid: parsed.oid,
      upstream: parsed.upstream,
      ahead: parsed.ahead,
      behind: parsed.behind,
      staged: limit(groups.staged),
      unstaged: limit(groups.unstaged),
      untracked: limit(groups.untracked),
      conflicted: limit(groups.conflicted),
      truncated: found.truncated || overLimit,
      reason: '',
    }
  }

  /**
   * 单个文件的 diff（未暂存 / 已暂存）；未跟踪文件在无 diff 时用文件内容合成「整份新增」。
   * @param sessionId - 目标会话 id。
   * @param repo - 选中的仓库根（空串=默认仓库）。
   * @param path - 仓库内相对路径。
   * @param staged - true 读索引对 HEAD 的差异，false 读工作区对索引的差异。
   * @param signal - 浏览器侧取消信号（必须最后）。
   * @returns diff 文本与标记。
   */
  async diff(sessionId: string, repo: string, path: string, staged: boolean, signal?: AbortSignal): Promise<JxGitDiffResult> {
    const { root } = await this.resolveRepo(sessionId, repo, signal)
    if (root === '') return { text: '', truncated: false, binary: false, empty: true }
    const args = ['diff', '--no-color', '--no-ext-diff', '--find-renames', '--unified=3']
    if (staged) args.push('--cached')
    args.push('--', path)
    const found = await this.runGit(root, args, signal)
    if (found.exitCode !== 0) {
      throw new Error(`git diff 失败（退出码 ${String(found.exitCode)}）：${found.stderr.trim()}`)
    }
    let text = found.stdout
    let truncated = found.truncated
    // 未跟踪文件没有 index 版本，git diff 为空——用文件内容合成整份新增，避免点开一片空白。
    if (text === '' && !staged) {
      const added = this.addedFileDiff(join(root, path), path)
      if (added !== undefined) {
        text = added.text
        truncated = added.truncated
      }
    }
    const capped = capText(text, DIFF_MAX_BYTES)
    return {
      text: capped.text,
      truncated: truncated || capped.truncated,
      binary: diffIsBinary(text),
      empty: text === '',
    }
  }

  /**
   * 最近提交历史（只读）。
   * @param sessionId - 目标会话 id。
   * @param repo - 选中的仓库根（空串=默认仓库）。
   * @param limit - 条数（1..100，越界自动收敛）。
   * @param signal - 浏览器侧取消信号（必须最后）。
   * @returns 一页提交与是否还有更早的提交。
   */
  async log(sessionId: string, repo: string, limit: number, signal?: AbortSignal): Promise<JxGitLogResult> {
    const { root } = await this.resolveRepo(sessionId, repo, signal)
    if (root === '') return { commits: [], more: false, empty: true }
    const wanted = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), LOG_MAX) : LOG_DEFAULT
    const format = `--pretty=format:%H${LOG_FIELD_SEPARATOR}%an${LOG_FIELD_SEPARATOR}%ad${LOG_FIELD_SEPARATOR}%s${LOG_RECORD_SEPARATOR}`
    const found = await this.runGit(root, ['log', `-n${wanted + 1}`, '--date=iso-strict', format], signal)
    if (found.exitCode !== 0) {
      // 空仓库（还没有任何提交）不是错误：git log 以 128 退出并说明没有提交。
      if (/does not have any commits yet|unknown revision|bad default revision/i.test(found.stderr)) {
        return { commits: [], more: false, empty: true }
      }
      throw new Error(`git log 失败（退出码 ${String(found.exitCode)}）：${found.stderr.trim()}`)
    }
    const parsed = parseLog(found.stdout)
    return {
      commits: parsed.slice(0, wanted).map(commit => ({ ...commit, short: commit.hash.slice(0, 8) })),
      more: parsed.length > wanted,
      empty: parsed.length === 0,
    }
  }

  /**
   * 单次提交的文件清单与 diff（只读）。
   * @param sessionId - 目标会话 id。
   * @param repo - 选中的仓库根（空串=默认仓库）。
   * @param hash - 提交哈希（4..40 位十六进制；非法直接拒绝）。
   * @param signal - 浏览器侧取消信号（必须最后）。
   * @returns 文件清单与 diff。
   */
  async show(sessionId: string, repo: string, hash: string, signal?: AbortSignal): Promise<JxGitCommitResult> {
    const { root } = await this.resolveRepo(sessionId, repo, signal)
    if (root === '') return { files: [], diff: { text: '', truncated: false, binary: false, empty: true } }
    if (!/^[0-9a-fA-F]{4,40}$/u.test(hash)) throw new Error(`提交标识不合法：${hash}`)
    const names = await this.runGit(root, ['show', '--name-status', '-z', '--format=', hash], signal)
    if (names.exitCode !== 0) {
      throw new Error(`git show --name-status 失败（退出码 ${String(names.exitCode)}）：${names.stderr.trim()}`)
    }
    const patch = await this.runGit(root, ['show', '--patch', '--no-color', '--no-ext-diff', '--unified=3', '--format=', hash], signal)
    if (patch.exitCode !== 0) {
      throw new Error(`git show 失败（退出码 ${String(patch.exitCode)}）：${patch.stderr.trim()}`)
    }
    const capped = capText(patch.stdout, DIFF_MAX_BYTES)
    return {
      files: parseNameStatus(names.stdout).map(file => ({
        index: file.status, worktree: '.', mark: '', path: file.path, original: file.original,
      })),
      diff: {
        text: capped.text,
        truncated: patch.truncated || capped.truncated,
        binary: diffIsBinary(patch.stdout),
        empty: patch.stdout === '',
      },
    }
  }

  /**
   * 未跟踪文件的伪 diff：把文件内容合成为整份新增。
   * @param absolutePath - 文件绝对路径（已由仓库根与相对路径拼出）。
   * @param displayPath - 展示用相对路径。
   * @returns 合成的 diff 与截断标记；文件读不到时为 undefined。
   */
  private addedFileDiff(absolutePath: string, displayPath: string): { text: string, truncated: boolean } | undefined {
    try {
      if (!statSync(absolutePath).isFile()) return undefined
      if (statSync(absolutePath).size > DIFF_MAX_BYTES * 8) {
        return { text: `（文件超过 ${String(Math.round(DIFF_MAX_BYTES * 8 / 1024))}KB，未跟踪文件不展示内容）\n`, truncated: true }
      }
      const raw = readFileSync(absolutePath)
      if (raw.includes(0)) return { text: '', truncated: false }
      return addedTextDiff(raw.toString('utf8'), displayPath, ADDED_DIFF_MAX_LINES)
    } catch {
      return undefined // 读不到（权限/竞态删除）时不展示伪 diff，调用方按空 diff 处理。
    }
  }
}

// typert-protocol 的远程方法标记（等价 @Remote('...')；外部包不用装饰器语法）。
const REMOTE_METHODS_KEY = '@deepseek-ai/dsh-typert-protocol/remote-methods'
/** 一个直调方法的标记。 */
const direct = (method: string) => Object.freeze({ method, invocation: Object.freeze({ kind: 'direct' }) })
Object.defineProperty(JxGitGateway.prototype, REMOTE_METHODS_KEY, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([direct('status'), direct('diff'), direct('log'), direct('show')]),
  }),
})

export default JxGitGateway
