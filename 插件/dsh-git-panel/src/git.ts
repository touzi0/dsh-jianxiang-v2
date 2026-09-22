/**
 * Git 面板的纯逻辑层（宿主半边）：porcelain 输出解析、diff 行分类、文本截断与仓库定位。
 * 这里不执行任何命令、不碰全局状态，便于 selftest.mjs 逐条断言；
 * 命令执行与 Remote 注册在 src/index.ts。
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

/** 一个改动文件在索引/工作区两侧的状态（porcelain 字母表）。 */
export interface GitFileEntry {
  /** 索引（已暂存）状态字母：M/A/D/R/C/T，'.' 表示未变。 */
  readonly index: string
  /** 工作区（未暂存）状态字母，同上。 */
  readonly worktree: string
  /** 未跟踪（`??`）时的原始状态码，否则空串。 */
  readonly mark: string
  readonly path: string
  /** 重命名/复制的原路径（无则空串）。 */
  readonly original: string
}

/** 一次 status 的解析结果。 */
export interface GitStatusParsed {
  readonly branch: string
  readonly oid: string
  readonly upstream: string
  readonly ahead: number
  readonly behind: number
  readonly entries: readonly GitFileEntry[]
}

/** 按分组呈现的改动文件。 */
export interface GitStatusGroups {
  readonly staged: readonly GitFileEntry[]
  readonly unstaged: readonly GitFileEntry[]
  readonly untracked: readonly GitFileEntry[]
  readonly conflicted: readonly GitFileEntry[]
}

/**
 * 解析 `git status --porcelain=v2 --branch -z`。
 * `-z` 下记录以 NUL 分隔且路径不做引号转义，因此空格、中文、换行路径都原样保留；
 * 类型 `2`（重命名/复制）的原路径是紧随其后的独立字段。
 * @param raw - 子进程 stdout 原文（含 NUL）。
 * @returns 分支头信息与逐文件状态。
 */
export function parseStatusV2(raw: string): GitStatusParsed {
  let branch = ''
  let oid = ''
  let upstream = ''
  let ahead = 0
  let behind = 0
  const entries: GitFileEntry[] = []
  const fields = raw.split('\0')
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index] as string
    if (field === '') continue
    if (field.startsWith('# ')) {
      if (field.startsWith('# branch.oid ')) oid = field.slice(13)
      else if (field.startsWith('# branch.head ')) branch = field.slice(14)
      else if (field.startsWith('# branch.upstream ')) upstream = field.slice(18)
      else if (field.startsWith('# branch.ab ')) {
        const match = /^# branch\.ab \+(\d+) -(\d+)$/.exec(field)
        if (match !== null) {
          ahead = Number(match[1])
          behind = Number(match[2])
        }
      }
      continue
    }
    const kind = field[0]
    if (kind === '?') {
      entries.push({ index: '.', worktree: '.', mark: '??', path: field.slice(2), original: '' })
      continue
    }
    if (kind === '!') continue // 忽略文件（仅在 --ignored 下出现）不是改动，不进列表。
    if (kind === 'u') {
      // u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
      const parts = field.split(' ')
      entries.push({
        index: (parts[1] ?? 'U').slice(0, 1),
        worktree: (parts[1] ?? 'U').slice(1, 2),
        mark: '',
        path: parts.slice(10).join(' '),
        original: '',
      })
      continue
    }
    if (kind === '1' || kind === '2') {
      // 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
      // 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>  → 原路径在下一个字段
      const parts = field.split(' ')
      const xy = parts[1] ?? '..'
      const pathStart = kind === '1' ? 8 : 9
      const original = kind === '2' ? (fields[index + 1] ?? '') : ''
      if (kind === '2') index++
      entries.push({
        index: xy.slice(0, 1),
        worktree: xy.slice(1, 2),
        mark: '',
        path: parts.slice(pathStart).join(' '),
        original,
      })
    }
  }
  return { branch, oid, upstream, ahead, behind, entries }
}

/**
 * 把改动文件分到「已暂存 / 未暂存 / 未跟踪 / 冲突」四组。
 * 一个文件可同时出现在前两组（`MM`：已暂存改动之上又有未暂存改动），与 git 语义一致。
 * @param entries - parseStatusV2 的条目。
 * @returns 四组列表（各自保持 git 输出顺序）。
 */
export function groupStatus(entries: readonly GitFileEntry[]): GitStatusGroups {
  const staged: GitFileEntry[] = []
  const unstaged: GitFileEntry[] = []
  const untracked: GitFileEntry[] = []
  const conflicted: GitFileEntry[] = []
  for (const entry of entries) {
    if (entry.mark === '??') {
      untracked.push(entry)
      continue
    }
    if (entry.index === 'U' || entry.worktree === 'U') {
      conflicted.push(entry)
      continue
    }
    if (entry.index !== '.' && entry.index !== ' ') staged.push(entry)
    if (entry.worktree !== '.' && entry.worktree !== ' ') unstaged.push(entry)
  }
  return { staged, unstaged, untracked, conflicted }
}

/** diff 文本里一行的渲染类别（呈现侧共用，见 diff-lines.ts）。 */
export type { DiffLineKind } from './diff-lines.ts'
export { diffLineKind } from './diff-lines.ts'

/**
 * 按 UTF-8 字节上限截断文本，保留行边界。
 * @param text - 原文。
 * @param maxBytes - 上限（字节）。
 * @returns 截断后的文本与是否发生截断。
 */
export function capText(text: string, maxBytes: number): { text: string, truncated: boolean } {
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes <= maxBytes) return { text, truncated: false }
  const sliced = Buffer.from(text, 'utf8').subarray(0, maxBytes).toString('utf8')
  const lastBreak = sliced.lastIndexOf('\n')
  const kept = lastBreak > 0 ? sliced.slice(0, lastBreak + 1) : sliced
  return { text: kept, truncated: true }
}

/** 一次提交的元信息。 */
export interface GitCommitEntry {
  readonly hash: string
  readonly author: string
  readonly time: string
  readonly subject: string
}

/** git log 的字段/记录分隔符（不会出现在提交信息里的控制字符）。 */
export const LOG_FIELD_SEPARATOR = '\u001f'
/** git log 的记录分隔符。 */
export const LOG_RECORD_SEPARATOR = '\u001e'

/**
 * 解析 `git log --pretty=format:%H<US>%an<US>%ad<US>%s<RS>` 的输出。
 * @param raw - 子进程 stdout 原文。
 * @returns 提交列表（顺序即 git 输出顺序）。
 */
export function parseLog(raw: string): GitCommitEntry[] {
  return raw
    .split(LOG_RECORD_SEPARATOR)
    .map(record => record.replace(/^\n+/u, ''))
    .filter(record => record !== '')
    .map(record => {
      const [hash = '', author = '', time = '', subject = ''] = record.split(LOG_FIELD_SEPARATOR)
      return { hash, author, time, subject }
    })
    .filter(commit => commit.hash !== '')
}

/**
 * 解析 `git show --name-status -z --format=` 的文件清单。
 * 记录形如 `M\0path\0`，重命名为 `R100\0old\0new\0`。
 * @param raw - 子进程 stdout 原文。
 * @returns 每个改动的状态字母与原路径（重命名时 original 为旧路径）。
 */
export function parseNameStatus(raw: string): Array<{ status: string, path: string, original: string }> {
  const fields = raw.split('\0').filter(field => field !== '')
  const files: Array<{ status: string, path: string, original: string }> = []
  for (let index = 0; index < fields.length; index++) {
    const status = fields[index] as string
    if (!/^[A-Z]\d*$/u.test(status)) continue
    const letter = status.slice(0, 1)
    if (letter === 'R' || letter === 'C') {
      const original = fields[index + 1] ?? ''
      const path = fields[index + 2] ?? ''
      index += 2
      files.push({ status: letter, path, original })
      continue
    }
    files.push({ status: letter, path: fields[index + 1] ?? '', original: '' })
    index++
  }
  return files
}

/** 扫描仓库时的跳过目录（依赖与元数据目录里不会有独立仓库）。 */
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', '.cache', 'dist', 'lib', 'target', 'vendor'])
/** 单次扫描最多检查的目录数，防止在大树上卡住。 */
const SCAN_BUDGET = 400

/**
 * diff 文本是否表示二进制差异（git 对二进制文件的两种写法）。
 * @param text - diff 原文。
 * @returns 是二进制差异则为 true。
 */
export function diffIsBinary(text: string): boolean {
  return /^GIT binary patch$/mu.test(text) || /^Binary files .* differ$/mu.test(text)
}

/**
 * 把整份文件内容合成「新增」diff：未跟踪文件没有 index 版本可比，
 * git diff 为空，面板用这份合成文本展示内容（每行加 `+`）。
 * @param text - 文件内容。
 * @param displayPath - 展示用路径（仓库内相对路径）。
 * @param maxLines - 最多合成的行数。
 * @returns 合成文本与是否截断。
 */
export function addedTextDiff(text: string, displayPath: string, maxLines: number): { text: string, truncated: boolean } {
  const lines = text.split('\n')
  // 末尾换行会切出一个空串，不算内容行。
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  const truncated = lines.length > maxLines
  const kept = truncated ? lines.slice(0, maxLines) : lines
  const header = `--- /dev/null\n+++ b/${displayPath}\n`
  const body = kept.map(line => `+${line}`).join('\n')
  return { text: `${header}${body}\n`, truncated }
}

/** 一个候选仓库。 */
export interface GitRepoRef {
  readonly path: string
  readonly name: string
}

/**
 * 判断目录是否是 git 仓库根（含 worktree/submodule 的 `.git` 文件形式）。
 * @param dir - 待判断目录。
 * @returns 是仓库根则为 true。
 */
export function isRepositoryRoot(dir: string): boolean {
  return existsSync(join(dir, '.git'))
}

/**
 * 以 base 为起点向下找仓库根（深度受限、跳过依赖目录、预算封顶）。
 * 会话工作目录常常只是某个仓库的一级子目录，因此扫描范围包含 base 自身与它下面两层。
 * @param base - 扫描起点目录。
 * @param maxDepth - 向下层数（base 自身算 0 层）。
 * @returns 找到的仓库根绝对路径，按发现顺序。
 */
export function findRepositories(base: string, maxDepth: number): string[] {
  const found: string[] = []
  let budget = SCAN_BUDGET
  const walk = (dir: string, depth: number): void => {
    if (budget <= 0 || found.length >= 12) return
    if (isRepositoryRoot(dir)) {
      found.push(resolve(dir))
      return
    }
    if (depth >= maxDepth) return
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      return // 无权限或已消失的目录直接跳过，扫描不因此中断。
    }
    for (const name of names) {
      if (budget <= 0) return
      if (name.startsWith('.') || SKIPPED_DIRECTORIES.has(name)) continue
      const child = join(dir, name)
      budget--
      try {
        if (!statSync(child).isDirectory()) continue
      } catch {
        continue // 竞态（构建中被删除）时跳过该项。
      }
      walk(child, depth + 1)
    }
  }
  walk(base, 0)
  return found
}

/**
 * 仓库根的展示名：取目录名。
 * @param path - 仓库根绝对路径。
 * @returns 展示名。
 */
export function repositoryName(path: string): string {
  return basename(path) === '' ? path : basename(path)
}

/** 提交信息字符数上限（单个 -m 参数的安全边界）。 */
export const MESSAGE_MAX_CHARS = 4000
/** pathspec 列表条数上限。 */
export const PATHSPEC_MAX = 500

/**
 * 净化提交信息：去掉控制字符（换行保留——多行提交信息合法）、压缩多余空行、限长。
 * @param message - 用户输入或 AI 生成的提交信息原文。
 * @returns 可安全作为单个 -m 参数的文本；空串表示没有可用内容。
 */
export function sanitizeMessage(message: string): string {
  const cleaned = message
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .replace(/\r\n?/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
  return cleaned.slice(0, MESSAGE_MAX_CHARS)
}

/**
 * 过滤出一组可安全传给 git 的 pathspec（在 `--` 之后作为独立 argv 元素使用）：
 * 拒绝绝对路径、`..`/`.` 段、pathspec magic 前缀、目录形式、含 NUL 的项，并去重限数。
 * @param paths - 浏览器送来的路径列表。
 * @returns 通过校验的路径（保持原顺序）。
 */
export function safePathspecs(paths: readonly string[]): string[] {
  const seen = new Set<string>()
  const ok: string[] = []
  for (const path of paths) {
    if (ok.length >= PATHSPEC_MAX) break
    if (path === '' || path.includes('\0') || path.length > 4096) continue
    if (/^[a-zA-Z]:[\\/]/u.test(path) || path.startsWith('/') || path.startsWith('\\')) continue
    if (path.startsWith(':') || path.startsWith('!') || path.startsWith('^')) continue
    const segments = path.split(/[\\/]/u)
    if (segments.includes('..') || segments.includes('.')) continue
    if (path.endsWith('/')) continue
    if (seen.has(path)) continue
    seen.add(path)
    ok.push(path)
  }
  return ok
}
