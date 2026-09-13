/**
 * 坚祥验收模组 jx-demo-client 的浏览器半边（手写官方 client bundle 格式，无需构建）。
 * 在设置页 Plugins 区注册一个「演示插件」标签页，看到它即证明：
 * 插件\ 目录 → 补丁层 insert → Loader 挂载 → client-modules 自动发现 dsh.client → 槽注册 全链路生效。
 */
window.__ModuleLoader__.load({ id: "jx-demo-client", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
const React = require('react')

const inject = ['slots']

function DemoTab() {
  return React.createElement('div', { style: { padding: '24px 8px' } },
    React.createElement('p', null, '✓ jx-demo-client 浏览器半边已加载'),
    React.createElement('p', { style: { opacity: 0.7, fontSize: '0.9em' } },
      '这个标签页来自 插件\\jx-demo-client —— 官方 client-modules 自动发现了它的 dsh.client 声明。'))
}

function apply(ctx) {
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'jxDemo',
    order: 30,
    label: () => '演示插件',
    inject: () => ({}),
  }, DemoTab))
}

exports.inject = inject
exports.apply = apply
return module.exports
} })
