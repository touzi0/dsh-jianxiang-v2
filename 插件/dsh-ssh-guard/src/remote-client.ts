/**
 * 手写的 jxSshGuard Remote 客户端贡献（与官方 typert.remote-client 工件同构）。
 */
import { z } from 'zod'

const recordSchema = z.object({
  t: z.string(),
  session: z.string(),
  tool: z.string(),
  action: z.enum(['rewrite', 'ask-catastrophic', 'rewrite-fallback-ask', 'ai-allow', 'ai-ask', 'ai-error']),
  command: z.string(),
  rewritten: z.string().optional(),
  note: z.string(),
})

const listResultSchema = z.array(recordSchema)

export const TYPERT_REMOTE = {
  package: 'dsh-ssh-guard',
  descriptors: [
    {
      id: 'dsh-ssh-guard#jxSshGuard/list',
      service: 'jxSshGuard',
      namespace: 'jxSshGuard',
      method: 'list',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'limit',
          wire: 'limit',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-ssh-guard#jxSshGuard/list:limit', create: () => z.number() },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-ssh-guard#jxSshGuard/list:result',
        create: () => listResultSchema,
      },
      sourceLocation: { file: 'src/index.ts', line: 1, column: 3 },
    },
    {
      id: 'dsh-ssh-guard#jxSshGuard/clear',
      service: 'jxSshGuard',
      namespace: 'jxSshGuard',
      method: 'clear',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-ssh-guard#jxSshGuard/clear:result',
        create: () => z.object({ cleared: z.literal(true) }),
      },
      sourceLocation: { file: 'src/index.ts', line: 1, column: 3 },
    },
  ],
}

export default TYPERT_REMOTE
