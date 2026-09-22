/**
 * 客户端半边打包配置：产出 lib/client.js，供 dsh.client 清单的 ./client 导出使用。
 *
 * 外部依赖范围以「Web shell 的模块表确实会提供」为准：只有 baseline
 * （react / react-dom / react/jsx-runtime / @deepseek-ai/*）保持 external。
 *
 * **第三方库必须打进产物**。踩过的坑：把 `zod` 列为 external 后，产物里出现
 * `require("zod")`，而模块表不提供它——浏览器加载该插件时 require 抛错。
 * 对照可正常工作的 `dsh-mode-switch`：它同样用 zod，但**打进产物**、不请求它。
 * 所以这里刻意**不**声明 zod / 其它第三方实现库。
 *
 * 官方客户端半边必须是 `window.__ModuleLoader__.load({ id, factory })` 的 **CJS 工厂**，
 * 不能是裸 ESM——宿主会把所有插件的 client.js 拼成一个响应一起下发，其中一个含
 * `export` 会让**整份响应**解析失败，全部插件一起加载不出来。
 */
export default {
  entry: { client: 'src/client.tsx' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  dts: false,
  clean: false,
  outputOptions: { entryFileNames: 'client.js' },
  external: [
    /^@deepseek-ai\//u,
    'react',
    'react-dom',
    // JSX 自动运行时由 shell 提供；不声明会被打进产物，导致与 shell 的
    // React 实例分离（hooks 失效）。
    'react/jsx-runtime',
  ],
  banner: 'window.__ModuleLoader__.load({ id: "dsh-permission-split", factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;',
  footer: 'return module.exports; } });',
}
