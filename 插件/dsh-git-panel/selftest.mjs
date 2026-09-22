#!/usr/bin/env node
/**
 * dsh-git-panel 纯逻辑自测（宿主半边 src/git.ts）：
 * porcelain=v2 解析与分组、diff 行分类、字节级截断、伪 diff、提交历史解析、
 * 改动清单解析、仓库扫描。不依赖 DSH 进程，直接 node selftest.mjs 即可跑。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addedTextDiff, capText, diffIsBinary, findRepositories,
  groupStatus, isRepositoryRoot, LOG_FIELD_SEPARATOR, LOG_RECORD_SEPARATOR, parseLog,
  parseNameStatus, parseStatusV2, repositoryName,
} from './src/git.ts'
import { diffLineKind } from './src/diff-lines.ts'

let passed = 0
const failures = []

/** 断言相等（对象用 JSON 比较）。 */
function eq(actual, expected, label) {
  const left = JSON.stringify(actual)
  const right = JSON.stringify(expected)
  if (left === right) {
    passed++
    return
  }
  failures.push(`${label}\n  期望 ${right}\n  实际 ${left}`)
}

/** 断言为真。 */
function ok(value, label) {
  if (value === true) {
    passed++
    return
  }
  failures.push(`${label}（得到 ${JSON.stringify(value)}）`)
}

const NUL = '\0'
const US = LOG_FIELD_SEPARATOR
const RS = LOG_RECORD_SEPARATOR

// --- parseStatusV2 / groupStatus -------------------------------------------
const statusRaw = [
  '# branch.oid 1111111111111111111111111111111111111111',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +2 -1',
  '1 M. N... 100644 100644 100644 aaa bbb src/changed.ts',
  '1 .M N... 100644 100644 100644 aaa bbb src/worktree only.ts',
  '1 MM N... 100644 100644 100644 aaa bbb src/both.ts',
  `2 R. N... 100644 100644 100644 aaa bbb R100 src/new name.ts${NUL}src/old name.ts`,
  '? 未跟踪文件.txt',
  'u UU N... 100644 100644 100644 100644 aaa bbb ccc src/conflict.ts',
  '! ignored.log',
].map(record => `${record}${NUL}`).join('')

const parsed = parseStatusV2(statusRaw)
eq(parsed.branch, 'main', 'branch.head')
eq(parsed.oid.slice(0, 4), '1111', 'branch.oid')
eq(parsed.upstream, 'origin/main', 'branch.upstream')
eq([parsed.ahead, parsed.behind], [2, 1], 'branch.ab')
eq(parsed.entries.length, 6, '条目数（忽略 ignored）')

const groups = groupStatus(parsed.entries)
eq(groups.staged.map(entry => entry.path), ['src/changed.ts', 'src/both.ts', 'src/new name.ts'], '已暂存分组')
eq(groups.unstaged.map(entry => entry.path), ['src/worktree only.ts', 'src/both.ts'], '未暂存分组（含空格路径）')
eq(groups.untracked.map(entry => entry.path), ['未跟踪文件.txt'], '未跟踪分组（中文路径）')
eq(groups.conflicted.map(entry => entry.path), ['src/conflict.ts'], '冲突分组')
eq(groups.staged.find(entry => entry.path === 'src/new name.ts').original, 'src/old name.ts', '重命名原路径')
ok(groups.untracked.every(entry => entry.mark === '??'), '未跟踪标记')

// --- diff 行分类 ------------------------------------------------------------
eq(diffLineKind('+added'), 'add', '+ 行')
eq(diffLineKind('-removed'), 'del', '- 行')
eq(diffLineKind('@@ -1,2 +1,3 @@'), 'hunk', '@@ 行')
eq(diffLineKind('diff --git a/x b/x'), 'meta', 'diff 头')
eq(diffLineKind('--- a/x'), 'meta', '--- 头')
eq(diffLineKind('+++ b/x'), 'meta', '+++ 头')
eq(diffLineKind('\\ No newline at end of file'), 'meta', '无换行标记')
eq(diffLineKind(' context'), 'context', '上下文行')

// --- 二进制识别与截断 --------------------------------------------------------
ok(diffIsBinary('Binary files a/x.png and b/x.png differ\n'), '二进制识别（Binary files）')
ok(diffIsBinary('GIT binary patch\nliteral 12\n'), '二进制识别（GIT binary patch）')
ok(!diffIsBinary('+text\n'), '纯文本不算二进制')

const short = capText('a\nb\n', 100)
eq([short.text, short.truncated], ['a\nb\n', false], '短文本不截断')
const long = capText(`${'x'.repeat(10)}\n${'y'.repeat(10)}\n${'z'.repeat(10)}\n`, 25)
ok(long.truncated, '长文本标记截断')
ok(long.text.endsWith('\n'), '截断保留行边界')
ok(Buffer.byteLength(long.text, 'utf8') <= 25, '截断不超上限')

const added = addedTextDiff('line1\nline2\n', 'src/new.ts', 10)
eq(added.truncated, false, '伪 diff 未截断')
ok(added.text.includes('+++ b/src/new.ts'), '伪 diff 带文件头')
ok(added.text.includes('+line1') && added.text.includes('+line2'), '伪 diff 每行前缀 +')
ok(!added.text.includes('+line3'), '伪 diff 不含多余行')
const addedCut = addedTextDiff('a\nb\nc\nd\n', 'x', 2)
eq(addedCut.truncated, true, '伪 diff 行数截断')
eq(addedCut.text.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).length, 2, '伪 diff 截断后行数')

// --- 提交历史 ---------------------------------------------------------------
const a = 'a'.repeat(40)
const b = 'b'.repeat(40)
const logRaw = `${a}${US}张三${US}2026-09-22T10:00:00+08:00${US}修复中文标题${RS}\n${b}${US}Li${US}2026-09-21T09:00:00+08:00${US}init${RS}`
const commits = parseLog(logRaw)
eq(commits.length, 2, '提交条数')
eq(commits[0], { hash: a, author: '张三', time: '2026-09-22T10:00:00+08:00', subject: '修复中文标题' }, '首条提交字段')
eq(commits[1].subject, 'init', '次条提交标题')
eq(parseLog(''), [], '空 log 输出')

// --- 改动清单 ---------------------------------------------------------------
const nameStatusRaw = `M${NUL}src/a.ts${NUL}R100${NUL}src/old.ts${NUL}src/new.ts${NUL}A${NUL}src/b.ts${NUL}`
eq(parseNameStatus(nameStatusRaw), [
  { status: 'M', path: 'src/a.ts', original: '' },
  { status: 'R', path: 'src/new.ts', original: 'src/old.ts' },
  { status: 'A', path: 'src/b.ts', original: '' },
], 'name-status 解析')

// --- 仓库扫描 ---------------------------------------------------------------
const fixture = mkdtempSync(join(tmpdir(), 'jx-git-selftest-'))
try {
  mkdirSync(join(fixture, 'repo-a', '.git'), { recursive: true })
  mkdirSync(join(fixture, 'plain'), { recursive: true })
  mkdirSync(join(fixture, 'parent', 'repo-b', '.git'), { recursive: true })
  mkdirSync(join(fixture, 'node_modules', 'repo-c', '.git'), { recursive: true })
  mkdirSync(join(fixture, 'plain', '.git-file'), { recursive: true })
  writeFileSync(join(fixture, 'plain', '.git'), 'gitdir: ../repo-a/.git/worktrees/plain\n')
  ok(isRepositoryRoot(join(fixture, 'repo-a')), '目录 + .git 目录 = 仓库根')
  ok(isRepositoryRoot(join(fixture, 'plain')), '文件形式的 .git（worktree）= 仓库根')
  ok(!isRepositoryRoot(fixture), '普通目录不是仓库根')
  const found = findRepositories(fixture, 2).map(path => path.replace(fixture, '')).sort()
  eq(found, ['\\parent\\repo-b', '\\plain', '\\repo-a'], '扫描命中仓库（跳过 node_modules）')
  eq(findRepositories(fixture, 0), [], '深度 0 只看自身')
  eq(repositoryName(join(fixture, 'repo-a')), 'repo-a', '仓库展示名')
} finally {
  rmSync(fixture, { recursive: true, force: true })
}

// --- 结果 -------------------------------------------------------------------
if (failures.length > 0) {
  console.error(`[selftest] ${failures.length} 项失败，${passed} 项通过：`)
  for (const failure of failures) console.error(` - ${failure}`)
  process.exit(1)
}
console.log(`[selftest] dsh-git-panel 纯逻辑自测全部通过（${passed} 项）`)
