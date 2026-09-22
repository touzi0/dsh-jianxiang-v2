#!/usr/bin/env node
/**
 * dsh-git-panel 真机解析自测：用真实 git 在系统临时目录里造一个已知仓库，
 * 跑与宿主半边完全相同的命令，再把输出喂给同一批解析函数。
 * 目的是用真机输出（而不是手写样例）守住 porcelain/log/name-status 的格式假设。
 * 不触碰工作区仓库：整个 fixture 建在 os.tmpdir() 下，跑完删掉。
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addedTextDiff, diffIsBinary, groupStatus, LOG_FIELD_SEPARATOR, LOG_RECORD_SEPARATOR,
  parseLog, parseNameStatus, parseStatusV2,
} from './src/git.ts'

let passed = 0
const failures = []

/** 断言相等。 */
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

/** 在 fixture 仓库里跑一条只读 git 命令（与宿主同样给 argv 数组，不过 shell）。 */
function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
}

const dir = mkdtempSync(join(tmpdir(), 'jx-git-live-'))
const config = ['-c', 'core.quotepath=false', '-c', 'user.email=selftest@example.com', '-c', 'user.name=selftest']

try {
  git(dir, ['init', '-b', 'main'])
  writeFileSync(join(dir, 'a.txt'), 'first\nsecond\nthird\n')
  writeFileSync(join(dir, '中文文件名.txt'), '内容一\n内容二\n')
  git(dir, [...config, 'add', '-A'])
  git(dir, [...config, 'commit', '-m', '初始提交：a.txt 与中文文件名'])

  // 已暂存（新增 b.txt）、未暂存（改 a.txt）、未跟踪（c.txt）
  writeFileSync(join(dir, 'b.txt'), 'staged file\n')
  git(dir, [...config, 'add', 'b.txt'])
  writeFileSync(join(dir, 'a.txt'), 'first\nsecond changed\nthird\nfourth\n')
  writeFileSync(join(dir, 'c.txt'), '未跟踪内容\nline two\n')

  // --- status（与宿主同一组参数） -------------------------------------------
  const statusRaw = git(dir, ['status', '--porcelain=v2', '--branch', '-z'])
  const parsed = parseStatusV2(statusRaw)
  eq(parsed.branch, 'main', '分支名')
  ok(/^[0-9a-f]{40}$/u.test(parsed.oid), '分支 oid 是 40 位十六进制')
  const groups = groupStatus(parsed.entries)
  eq(groups.staged.map(entry => entry.path).sort(), ['b.txt'], '真机：已暂存 = b.txt')
  eq(groups.unstaged.map(entry => entry.path).sort(), ['a.txt'], '真机：未暂存 = a.txt')
  eq(groups.untracked.map(entry => entry.path).sort(), ['c.txt'], '真机：未跟踪 = c.txt')
  ok(parsed.entries.every(entry => entry.path !== ''), '真机：每条都有路径')

  // --- diff（未暂存 / 已暂存） -----------------------------------------------
  const worktree = git(dir, ['diff', '--no-color', '--no-ext-diff', '--find-renames', '--unified=3', '--', 'a.txt'])
  ok(worktree.startsWith('diff --git '), '真机 diff 以 diff --git 开头')
  ok(worktree.includes('@@'), '真机 diff 含 hunk 头')
  ok(worktree.includes('+second changed'), '真机 diff 含新增行')
  ok(worktree.includes('-second'), '真机 diff 含删除行')
  ok(!diffIsBinary(worktree), '真机 diff 不是二进制')

  const staged = git(dir, ['diff', '--no-color', '--no-ext-diff', '--find-renames', '--unified=3', '--cached', '--', 'b.txt'])
  ok(staged.includes('+staged file'), '真机已暂存 diff 含新增文件内容')

  // 未跟踪文件在 git diff 里为空——宿主用文件内容合成伪 diff。
  const untrackedDiff = git(dir, ['diff', '--no-color', '--no-ext-diff', '--find-renames', '--unified=3', '--', 'c.txt'])
  eq(untrackedDiff, '', '真机：未跟踪文件 git diff 为空（故需要伪 diff）')
  const synth = addedTextDiff('未跟踪内容\nline two\n', 'c.txt', 4000)
  ok(synth.text.includes('+++ b/c.txt'), '伪 diff 文件头')
  ok(synth.text.includes('+未跟踪内容') && synth.text.includes('+line two'), '伪 diff 内容')

  // --- 提交历史（与宿主同一格式串） ------------------------------------------
  const format = `--pretty=format:%H${LOG_FIELD_SEPARATOR}%an${LOG_FIELD_SEPARATOR}%ad${LOG_FIELD_SEPARATOR}%s${LOG_RECORD_SEPARATOR}`
  const logRaw = git(dir, ['log', '-n31', '--date=iso-strict', format])
  const commits = parseLog(logRaw)
  eq(commits.length, 1, '真机：只有一个提交')
  ok(/^[0-9a-f]{40}$/u.test(commits[0].hash), '提交哈希 40 位')
  eq(commits[0].author, 'selftest', '提交作者')
  eq(commits[0].subject, '初始提交：a.txt 与中文文件名', '提交标题（中文）')
  ok(/^\d{4}-\d{2}-\d{2}T/u.test(commits[0].time), '提交时间为 ISO 严格格式')

  // --- 单次提交的清单与 diff -------------------------------------------------
  const names = git(dir, ['show', '--name-status', '-z', '--format=', 'HEAD'])
  eq(parseNameStatus(names), [
    { status: 'A', path: 'a.txt', original: '' },
    { status: 'A', path: '中文文件名.txt', original: '' },
  ], '真机：HEAD 改动清单（含中文路径）')
  const patch = git(dir, ['show', '--patch', '--no-color', '--no-ext-diff', '--unified=3', '--format=', 'HEAD'])
  ok(patch.includes('+first'), '真机：HEAD patch 含内容')

  // --- 空仓库：git log 以 128 退出（宿主据此返回「还没有提交」） ----------------
  const empty = join(dir, '..', `jx-git-live-empty-${String(Date.now())}`)
  rmSync(empty, { recursive: true, force: true })
  try {
    execFileSync('git', ['init', '-b', 'main', empty], { encoding: 'utf8' })
    let code = 0
    let message = ''
    try {
      git(empty, ['log', '-n2', '--date=iso-strict', format])
    } catch (error) {
      code = error.status ?? 0
      message = String(error.stderr ?? '')
    }
    eq(code, 128, '空仓库 git log 退出码')
    ok(/does not have any commits yet/u.test(message), '空仓库 git log 说明文案')
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error(`[selftest-live] ${failures.length} 项失败，${passed} 项通过：`)
  for (const failure of failures) console.error(` - ${failure}`)
  process.exit(1)
}
console.log(`[selftest-live] 真机 git 输出与解析全部一致（${passed} 项）`)
