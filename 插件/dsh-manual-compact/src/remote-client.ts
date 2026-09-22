/**
 * 手写的 Typert Remote 客户端贡献（与官方 typert.remote-client.js 生成工件同构，
 * 写法同 dsh-mod-manager）。由客户端半边经 ctx.remote.$mount() 挂载，
 * 得到 ctx.remote.jxManualCompact。
 * 注：官方 0.1.6+ 起 codec 必须给 `create: () => <zod>`（旧的 `schema:` 会被拒绝）。
 */
import { z } from 'zod'

const compactResultSchema = z.object({
  shadowedCount: z.number(),
  shadowedTokens: z.number(),
  summaryChars: z.number(),
})

const numberCodec = (typeSymbol: string) => ({
  mode: 'strict' as const,
  typeSymbol,
  create: () => z.number(),
})

const stringCodec = (typeSymbol: string) => ({
  mode: 'strict' as const,
  typeSymbol,
  create: () => z.string(),
})

export const TYPERT_REMOTE = {
  package: 'dsh-manual-compact',
  descriptors: [
    {
      id: 'dsh-manual-compact#jxManualCompact/compact',
      service: 'jxManualCompact',
      namespace: 'jxManualCompact',
      method: 'compact',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'sessionId',
          wire: 'sessionId',
          source: 'json',
          codec: stringCodec('dsh-manual-compact#jxManualCompact/compact:sessionId'),
        },
        {
          name: 'turn',
          wire: 'turn',
          source: 'json',
          codec: numberCodec('dsh-manual-compact#jxManualCompact/compact:turn'),
        },
        {
          name: 'anchorSeq',
          wire: 'anchorSeq',
          source: 'json',
          codec: numberCodec('dsh-manual-compact#jxManualCompact/compact:anchorSeq'),
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-manual-compact#jxManualCompact/compact:result',
        create: () => compactResultSchema,
      },
      sourceLocation: { file: 'src/index.ts', line: 1, column: 3 },
    },
  ],
}

export default TYPERT_REMOTE
