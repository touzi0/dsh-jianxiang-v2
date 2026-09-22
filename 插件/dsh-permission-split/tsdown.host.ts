/**
 * 宿主半边打包配置：与仓库根 tsdown.config.ts 隔离。
 *
 * 不隔离时 tsdown 会自动发现仓库根配置并尝试解析工作区，在 插件/ 目录下必然失败。
 * `@deepseek-ai/*` 保持外部依赖——宿主模组由 profile 池解析它们。
 */
export default {
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  dts: false,
  clean: false,
  // 产出 lib/index.js：与 package.json 的 main/exports 及各模组既有约定一致。
  outputOptions: { entryFileNames: 'index.js' },
  external: [/^@deepseek-ai\//u, /^node:/u],
}
