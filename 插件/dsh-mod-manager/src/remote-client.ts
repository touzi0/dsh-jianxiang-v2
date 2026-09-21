/**
 * 手写的 Typert Remote 客户端贡献（与官方 typert.remote-client.js 生成工件同构）。
 * 由客户端半边经 ctx.remote.$mount() 挂载，得到 ctx.remote.jxMods。
 */
import { z } from 'zod'

const modRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  entry: z.string(),
  hasClient: z.boolean(),
  replaces: z.array(z.string()),
  overrides: z.array(z.object({ id: z.string(), config: z.unknown() })),
  enabled: z.boolean(),
})

const snapshotSchema = z.object({
  modsRoot: z.string(),
  patchFile: z.string(),
  mods: z.array(modRowSchema),
})

const setEnabledResultSchema = z.object({
  restartNeeded: z.literal(true),
})

export const TYPERT_REMOTE = {
  package: 'dsh-mod-manager',
  descriptors: [
    {
      id: 'dsh-mod-manager#jxMods/list',
      service: 'jxMods',
      namespace: 'jxMods',
      method: 'list',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-mod-manager#jxMods/list:result',
        create: () => snapshotSchema,
      },
      sourceLocation: { file: 'src/index.ts', line: 1, column: 3 },
    },
    {
      id: 'dsh-mod-manager#jxMods/setEnabled',
      service: 'jxMods',
      namespace: 'jxMods',
      method: 'setEnabled',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'id',
          wire: 'id',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-mod-manager#jxMods/setEnabled:id', create: () => z.string() },
        },
        {
          name: 'enabled',
          wire: 'enabled',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-mod-manager#jxMods/setEnabled:enabled', create: () => z.boolean() },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-mod-manager#jxMods/setEnabled:result',
        create: () => setEnabledResultSchema,
      },
      sourceLocation: { file: 'src/index.ts', line: 1, column: 3 },
    },
    {
      id: 'dsh-mod-manager#jxMods/rescan',
      service: 'jxMods',
      namespace: 'jxMods',
      method: 'rescan',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-mod-manager#jxMods/rescan:result',
        create: () => snapshotSchema,
      },
      sourceLocation: { file: 'src/index.ts', line: 1, column: 3 },
    },
  ],
}

export default TYPERT_REMOTE
