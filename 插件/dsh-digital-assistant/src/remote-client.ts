/**
 * 手写的 Typert Remote 客户端贡献（与官方 typert.remote-client.js 生成工件同构）。
 * 由客户端半边经 ctx.remote.$mount() 挂载，得到 ctx.remote.jxAssistant。
 * 注：官方 0.1.6+ 起 codec 必须给 `create: () => <zod>`（旧的 `schema:` 会被拒绝）。
 */
import { z } from 'zod'

const ensureResultSchema = z.object({ sessionId: z.string() })

const statusResultSchema = z.object({
  sessionId: z.string(),
  cwd: z.string(),
  running: z.boolean(),
  dispatched: z.number(),
})

export const TYPERT_REMOTE = {
  package: 'dsh-digital-assistant',
  descriptors: [
    {
      id: 'dsh-digital-assistant#jxAssistant/ensure',
      service: 'jxAssistant',
      namespace: 'jxAssistant',
      method: 'ensure',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-digital-assistant#jxAssistant/ensure:result',
        create: () => ensureResultSchema,
      },
      sourceLocation: { file: 'src/index.ts', line: 1, column: 3 },
    },
    {
      id: 'dsh-digital-assistant#jxAssistant/status',
      service: 'jxAssistant',
      namespace: 'jxAssistant',
      method: 'status',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-digital-assistant#jxAssistant/status:result',
        create: () => statusResultSchema,
      },
      sourceLocation: { file: 'src/index.ts', line: 1, column: 3 },
    },
  ],
}

export default TYPERT_REMOTE
