/**
 * 手写的 jxSshReview Remote 客户端贡献（与官方 typert.remote-client 工件同构）。
 */
import { z } from 'zod'

const recordSchema = z.object({
  t: z.string(),
  session: z.string(),
  tool: z.string(),
  action: z.enum(['ask-catastrophic', 'ai-allow', 'ai-ask', 'ai-error']),
  command: z.string(),
  note: z.string(),
})

const listResultSchema = z.array(recordSchema)

export const TYPERT_REMOTE = {
  package: 'dsh-ssh-review',
  descriptors: [
    {
      id: 'dsh-ssh-review#jxSshReview/list',
      service: 'jxSshReview',
      namespace: 'jxSshReview',
      method: 'list',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'limit',
          wire: 'limit',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-ssh-review#jxSshReview/list:limit', create: () => z.number() },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-ssh-review#jxSshReview/list:result',
        create: () => listResultSchema,
      },
      sourceLocation: { file: 'src/index.ts', line: 1, column: 3 },
    },
    {
      id: 'dsh-ssh-review#jxSshReview/clear',
      service: 'jxSshReview',
      namespace: 'jxSshReview',
      method: 'clear',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-ssh-review#jxSshReview/clear:result',
        create: () => z.object({ cleared: z.literal(true) }),
      },
      sourceLocation: { file: 'src/index.ts', line: 1, column: 3 },
    },
  ],
}

export default TYPERT_REMOTE
