/** 手写的 jxPlans Remote 客户端贡献。 */
import { z } from 'zod'

const planRecordSchema = z.object({
  seq: z.number(),
  time: z.number(),
  plan: z.string(),
  status: z.enum(['approved', 'rejected', 'pending']),
  file: z.string(),
})

export const TYPERT_REMOTE = {
  package: 'dsh-plan-aside',
  descriptors: [
    {
      id: 'dsh-plan-aside#jxPlans/list',
      service: 'jxPlans',
      namespace: 'jxPlans',
      method: 'list',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'sessionId',
          wire: 'sessionId',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-plan-aside#jxPlans/list:sessionId', create: () => z.string() },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-plan-aside#jxPlans/list:result',
        create: () => z.object({ plans: z.array(planRecordSchema) }),
      },
      sourceLocation: { file: 'src/index.ts', line: 1, column: 3 },
    },
  ],
}

export default TYPERT_REMOTE
