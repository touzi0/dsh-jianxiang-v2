import { defineConfig } from 'tsdown'

/**
 * 浏览器半边：复刻官方 client bundle 格式（CJS 工厂 + __ModuleLoader__ 包装）。
 * 平台基线模块保持 external，其余全部内联。
 */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

export default defineConfig({
  name: 'dsh-plan-aside/client',
  entry: { client: 'src/client.tsx' },
  outDir: 'lib',
  format: 'cjs',
  fixedExtension: false,
  outputOptions: { entryFileNames: 'client.js' },
  platform: 'browser',
  target: 'es2022',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: specifier => PLATFORM_MODULES.includes(specifier),
    alwaysBundle: specifier => !PLATFORM_MODULES.includes(specifier),
  },
  inputOptions: {
    resolve: {
      conditionNames: ['production', 'browser', 'import', 'module', 'default'],
    },
  },
  banner: 'window.__ModuleLoader__.load({ id: "dsh-plan-aside", factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;',
  footer: 'return module.exports; } });',
})
