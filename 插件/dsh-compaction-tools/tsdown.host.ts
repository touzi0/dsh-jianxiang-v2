import { defineConfig } from 'tsdown'

/** 宿主半边：ESM，宿主包保持 external（由愈合池 junction 提供）。 */
export default defineConfig({
  name: 'dsh-compaction-tools/host',
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
    '@deepseek-ai/dsh-tools',
    '@deepseek-ai/dsh-compaction',
    '@deepseek-ai/dsh-token-meter',
  ],
})
