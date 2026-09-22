/**
 * 手写的 jxGit Remote 客户端贡献（与官方 typert.remote-client.js 生成工件同构）。
 * 由客户端半边经 ctx.remote.$mount() 挂载，得到 ctx.remote.jxGit。
 * 注：官方 0.1.6+ 起 codec 必须给 `create: () => <zod>`（旧的 `schema:` 会被拒绝）；
 * 宿主方法最后一个 `signal` 参数不进 wire，因此这里的 parameters 只列业务参数。
 */
import { z } from 'zod'

const repoRefSchema = z.object({ path: z.string(), name: z.string() })

const fileSchema = z.object({
  index: z.string(),
  worktree: z.string(),
  mark: z.string(),
  path: z.string(),
  original: z.string(),
})

const statusSchema = z.object({
  repos: z.array(repoRefSchema),
  repo: z.string(),
  branch: z.string(),
  oid: z.string(),
  upstream: z.string(),
  ahead: z.number(),
  behind: z.number(),
  staged: z.array(fileSchema),
  unstaged: z.array(fileSchema),
  untracked: z.array(fileSchema),
  conflicted: z.array(fileSchema),
  truncated: z.boolean(),
  reason: z.string(),
})

const diffSchema = z.object({
  text: z.string(),
  truncated: z.boolean(),
  binary: z.boolean(),
  empty: z.boolean(),
})

const logSchema = z.object({
  commits: z.array(z.object({
    hash: z.string(),
    short: z.string(),
    author: z.string(),
    time: z.string(),
    subject: z.string(),
  })),
  more: z.boolean(),
  empty: z.boolean(),
})

const commitSchema = z.object({
  files: z.array(fileSchema),
  diff: diffSchema,
})

const PACKAGE = 'dsh-git-panel'

/** 一个业务参数的 codec。 */
const codec = (method: string, name: string, schema: z.ZodTypeAny) => ({
  name,
  wire: name,
  source: 'json' as const,
  codec: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#jxGit/${method}:${name}`, create: () => schema },
})

/** 一个方法的返回值 codec。 */
const result = (method: string, schema: z.ZodTypeAny) => ({
  mode: 'strict' as const,
  typeSymbol: `${PACKAGE}#jxGit/${method}:result`,
  create: () => schema,
})

const sourceLocation = { file: 'src/index.ts', line: 1, column: 3 }

export const TYPERT_REMOTE = {
  package: PACKAGE,
  descriptors: [
    {
      id: `${PACKAGE}#jxGit/status`,
      service: 'jxGit',
      namespace: 'jxGit',
      method: 'status',
      invocation: { kind: 'direct' },
      parameters: [codec('status', 'sessionId', z.string()), codec('status', 'repo', z.string())],
      result: result('status', statusSchema),
      sourceLocation,
    },
    {
      id: `${PACKAGE}#jxGit/diff`,
      service: 'jxGit',
      namespace: 'jxGit',
      method: 'diff',
      invocation: { kind: 'direct' },
      parameters: [
        codec('diff', 'sessionId', z.string()),
        codec('diff', 'repo', z.string()),
        codec('diff', 'path', z.string()),
        codec('diff', 'staged', z.boolean()),
      ],
      result: result('diff', diffSchema),
      sourceLocation,
    },
    {
      id: `${PACKAGE}#jxGit/log`,
      service: 'jxGit',
      namespace: 'jxGit',
      method: 'log',
      invocation: { kind: 'direct' },
      parameters: [
        codec('log', 'sessionId', z.string()),
        codec('log', 'repo', z.string()),
        codec('log', 'limit', z.number()),
      ],
      result: result('log', logSchema),
      sourceLocation,
    },
    {
      id: `${PACKAGE}#jxGit/show`,
      service: 'jxGit',
      namespace: 'jxGit',
      method: 'show',
      invocation: { kind: 'direct' },
      parameters: [
        codec('show', 'sessionId', z.string()),
        codec('show', 'repo', z.string()),
        codec('show', 'hash', z.string()),
      ],
      result: result('show', commitSchema),
      sourceLocation,
    },
  ],
}

export default TYPERT_REMOTE
