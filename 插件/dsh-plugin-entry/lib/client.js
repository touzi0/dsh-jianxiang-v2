/**
 * 已退役模组 dsh-plugin-entry —— 浏览器半边空实现占位。
 *
 * 这个模组原先把官方「插件」入口从侧边栏挪进设置（隐藏侧栏行 + 设置里加一个
 * 自绘的「插件管理」分区 + 把「内置插件」文案改写成「内置组件」）。2026-09-22 起
 * 这些改动直接做在官方 `packages/client/ui-plugin-manager` 与
 * `packages/client/ui-settings-plugins` 里：官方页面现在本身就是设置左侧的一个
 * 分区，不再需要外挂。旧版完整实现放在 插件\.垃圾站\dsh-plugin-entry\ 备查。
 *
 * 保留这个文件（而不是删掉整个目录）的唯一原因：模组清单在服务启动时就已装载，
 * 正在运行的服务仍会按旧路径请求本 bundle；文件缺失会让那一次页面加载取不到它。
 * 本模组默认停用（package.json 的 jx.defaultEnabled = false），下一次启动后
 * 补丁层里不再有它，这里也就彻底不参与加载。
 *
 * 依旧遵循手写官方 client bundle 格式：不能出现 `export` 语句。
 */
window.__ModuleLoader__.load({
  id: "dsh-plugin-entry",
  factory: () => ({ apply() {} }),
});
