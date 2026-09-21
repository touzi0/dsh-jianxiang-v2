/**
 * 手写的 jxSearch Remote 客户端贡献（与官方 typert.remote-client.js 生成工件同构）。
 */
import { z } from 'zod'

const pageSchema = z.object({
  hits: z.array(z.object({
    sessionId: z.string(),
    snippet: z.string(),
    time: z.number(),
  })),
  nextCursor: z.string(),
})

export const TYPERT_REMOTE = {
  package: 'dsh-fulltext-search',
  descriptors: [
    {
      id: 'dsh-fulltext-search#jxSearch/search',
      service: 'jxSearch',
      namespace: 'jxSearch',
      method: 'search',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'query',
          wire: 'query',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-fulltext-search#jxSearch/search:query', create: () => z.string() },
        },
        {
          name: 'cursor',
          wire: 'cursor',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-fulltext-search#jxSearch/search:cursor', create: () => z.string() },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-fulltext-search#jxSearch/search:result',
        create: () => pageSchema,
      },
      sourceLocation: { file: 'src/index.ts', line: 1, column: 3 },
    },
  ],
}

export default TYPERT_REMOTE
