import { defineConfig } from 'tsdown'

/**
 * 宿主半边：ESM，宿主包保持 external（由愈合池 junction 提供）。
 * 注意 `@deepseek-ai/dsh-compaction-basic/src/region.ts` 有意**不** external：
 * 官方 compactSurfaceRegion 事务会被打进本插件产物（官方包未从入口导出它，
 * 而安装副本里没有 src/ 目录，运行时无法按包名解析）。
 */
export default defineConfig({
  name: 'dsh-manual-compact/host',
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: 'esm',
  fixedExtension: false,
  platform: 'node',
  target: 'node20',
  dts: false,
  clean: false,
  external: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-typert-protocol',
    '@deepseek-ai/dsh-compaction',
    '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-llm',
  ],
})
