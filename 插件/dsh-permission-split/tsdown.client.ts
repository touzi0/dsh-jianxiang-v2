/**
 * 客户端半边打包配置：产出 lib/client.js，供 dsh.client 清单的 ./client 导出使用。
 *
 * 与官方 client 包的打包方式一致：baseline（react / cordis / client-store /
 * ui-primitives / ui-slots）保持外部依赖，由 Web shell 的模块表提供。
 *
 * 注意：官方客户端半边必须是 `window.__ModuleLoader__.load({ id, factory })` 的 **CJS 工厂**，
 * 不能是裸 ESM——宿主会把所有插件的 client.js 拼成一个响应一起下发，其中一个含
 * `export` 会让**整份响应**解析失败，全部插件一起加载不出来（实测踩过）。
 * 所以这里用 `format: ['cjs']` + banner/footer 包出工厂外壳。
 */
export default {
  entry: { client: 'src/client.ts' },
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
  ],
  banner: 'window.__ModuleLoader__.load({ id: "dsh-permission-split", factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;',
  footer: 'return module.exports; } });',
}
