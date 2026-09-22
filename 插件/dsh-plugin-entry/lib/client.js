/**
 * 插件入口搬家 + 设置内的插件管理 —— 浏览器半边（手写官方 client bundle 格式，无需构建）。
 *
 * 四件事：
 *   1. 隐藏侧边栏「新建会话」下面那行官方「插件」（面板行样式由 shell 固定，只能用 CSS）；
 *   2. 在**设置左侧**加一个与「内置组件」同级的「插件管理」分区（走官方 `settings.section` 槽）；
 *   3. 这个分区里自绘插件管理界面：官方 `pluginManager` Remote 的 bundles / plugins 列表 + 开关 + 卸载。
 *      为什么自绘而不用官方那页：客户端插件**不允许** runtime-import 另一个功能插件的组件，
 *      官方那页是 `main` 槽里的面板；能复用的只有同一套 Remote 接口。放进设置面板后，
 *      宽度自然收进设置列（官方那页在主列很宽、中间大片留白）。
 *   4. 把设置里原来的分区名「内置插件」改写成「内置组件」（精确匹配文本节点，不碰别的文案）。
 *
 * 官方 CSS Modules 的类名形态是 `[hash]_[local]`（`KFGIsa_panelList` 这种），所以用
 * `nav[class*="panelList"]` 限定在侧边栏的面板列表里，不会误伤设置页里的同名按钮。
 */
window.__ModuleLoader__.load({ id: "dsh-plugin-entry", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
const React = require("react");

/** 侧边栏面板行的选择器（中英两种 aria-label 都覆盖）。 */
const SIDEBAR_ROW_SELECTOR = 'nav[class*="panelList"] button[aria-label="插件"],'
  + 'nav[class*="panelList"] button[aria-label="Plugins"]';

/** 设置里那个分区的旧名 → 新名。 */
const RENAMES = [["内置插件", "内置组件"], ["Built-in plugins", "Built-in components"]];

/** 文案命名空间。 */
const NS = "dshPluginEntry";

/** 中文文案。 */
const zh = {
  nav: "插件管理",
  bundles: "插件包",
  entries: "插件条目",
  refresh: "刷新",
  loading: "读取中…",
  empty: "没有可管理的插件。",
  uninstall: "卸载",
  confirmUninstall: "确定卸载插件包 {name}？",
  restartHint: "改动已写入 profile，重启服务后生效。",
  errorPrefix: "操作失败：",
  readOnly: "不可切换",
  phase: "状态",
};

/** 英文文案。 */
const en = {
  nav: "Plugin manager",
  bundles: "Bundles",
  entries: "Plugin entries",
  refresh: "Refresh",
  loading: "Loading…",
  empty: "No manageable plugins.",
  uninstall: "Uninstall",
  confirmUninstall: "Uninstall bundle {name}?",
  restartHint: "Saved to the profile; restart the service to apply.",
  errorPrefix: "Action failed: ",
  readOnly: "Locked",
  phase: "Phase",
};

/** 依赖的客户端服务与 Remote。 */
const inject = ["slots", "locale", "remote", "remote.pluginManager"];

/** 手写样式收敛到一处，颜色一律走官方设计令牌。 */
const S = {
  page: { display: "flex", flexDirection: "column", gap: 8, paddingBottom: 24 },
  bar: { display: "flex", alignItems: "center", gap: 8 },
  hint: { margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-text-tertiary, #9a9a9a)" },
  error: { margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-state-error-primary, #e5484d)" },
  groupTitle: { margin: "12px 0 0", fontSize: 13, fontWeight: 600, color: "var(--dsw-alias-text-primary, #1a1a1a)" },
  row: {
    display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
    borderBottom: "0.5px solid var(--dsw-alias-border-l2, #e6e6e6)",
  },
  rowText: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 },
  name: { fontSize: 13, lineHeight: "18px", color: "var(--dsw-alias-text-primary, #1a1a1a)", wordBreak: "break-all" },
  desc: { fontSize: 12, lineHeight: "16px", color: "var(--dsw-alias-text-tertiary, #9a9a9a)", wordBreak: "break-word" },
  button: {
    padding: "4px 10px", fontSize: 12, lineHeight: "18px", borderRadius: 6,
    border: "0.5px solid var(--dsw-alias-border-l2, #d9d9d9)",
    background: "var(--dsw-alias-bg-base, #fff)", color: "var(--dsw-alias-text-primary, #1a1a1a)",
    cursor: "pointer", whiteSpace: "nowrap",
  },
  checkbox: { width: 14, height: 14, cursor: "pointer", flex: "none" },
};

/** 一行：名称/描述 + 右侧开关（或只读标记）与可选卸载按钮。 */
function Row(props) {
  const t = props.t;
  const right = props.readOnly === true
    ? React.createElement("span", { style: S.desc, title: t("readOnly") }, t("readOnly"))
    : React.createElement("input", {
      type: "checkbox",
      style: S.checkbox,
      checked: props.enabled === true,
      onChange: (event) => { props.onToggle(event.target.checked); },
    });
  return React.createElement("div", { style: S.row },
    React.createElement("div", { style: S.rowText },
      React.createElement("span", { style: S.name }, props.title),
      props.subtitle === undefined ? null : React.createElement("span", { style: S.desc }, props.subtitle)),
    right,
    props.onRemove === undefined ? null : React.createElement("button", {
      type: "button", style: S.button, onClick: () => { props.onRemove(); },
    }, t("uninstall")));
}

/** 设置里的「插件管理」分区。 */
function PluginManagerSection(props) {
  const t = props.t;
  const [state, setState] = React.useState({
    phase: "loading", bundles: [], plugins: [], error: undefined, notice: undefined,
  });

  const load = React.useCallback(() => {
    setState((prev) => ({ ...prev, phase: "loading", error: undefined }));
    Promise.all([props.listBundles(), props.listPlugins()]).then(
      (result) => {
        setState({ phase: "ready", bundles: result[0] ?? [], plugins: result[1] ?? [], error: undefined, notice: undefined });
      },
      (reason) => { setState((prev) => ({ ...prev, phase: "error", error: String(reason) })); },
    );
  }, [props]);

  React.useEffect(() => { load(); }, [load]);

  const run = (action) => {
    Promise.resolve(action).then(
      () => { setState((prev) => ({ ...prev, notice: t("restartHint"), error: undefined })); load(); },
      (reason) => { setState((prev) => ({ ...prev, error: t("errorPrefix") + String(reason) })); },
    );
  };

  const children = [];
  children.push(React.createElement("div", { key: "bar", style: S.bar },
    React.createElement("button", { type: "button", style: S.button, onClick: () => { load(); } }, t("refresh")),
    state.phase === "loading" ? React.createElement("span", { style: S.hint }, t("loading")) : null));
  if (state.error !== undefined) children.push(React.createElement("p", { key: "err", style: S.error }, state.error));
  if (state.notice !== undefined) children.push(React.createElement("p", { key: "notice", style: S.hint }, state.notice));

  children.push(React.createElement("h3", { key: "bt", style: S.groupTitle }, `${t("bundles")}（${state.bundles.length}）`));
  if (state.bundles.length === 0) children.push(React.createElement("p", { key: "be", style: S.hint }, t("empty")));
  for (const bundle of state.bundles) {
    const parts = [bundle.version, bundle.description].filter((part) => typeof part === "string" && part !== "");
    children.push(React.createElement(Row, {
      key: "b:" + bundle.name,
      t,
      title: bundle.name + (bundle.optional === true ? "（可选）" : ""),
      subtitle: parts.length === 0 ? undefined : parts.join(" · "),
      enabled: bundle.enabled,
      readOnly: bundle.readOnlyReason !== undefined,
      onToggle: (next) => { run(props.setBundleEnabled(bundle.name, next)); },
      onRemove: bundle.removable === true
        ? () => {
          if (window.confirm(t("confirmUninstall").replace("{name}", bundle.name))) run(props.removeBundle(bundle.name));
        }
        : undefined,
    }));
  }

  children.push(React.createElement("h3", { key: "et", style: S.groupTitle }, `${t("entries")}（${state.plugins.length}）`));
  if (state.plugins.length === 0) children.push(React.createElement("p", { key: "ee", style: S.hint }, t("empty")));
  for (const entry of state.plugins) {
    const id = entry.entryId ?? entry.patchId ?? entry.moduleName;
    const phase = typeof entry.fiberPhase === "string" && entry.fiberPhase !== ""
      ? `${t("phase")}: ${entry.fiberPhase}`
      : undefined;
    children.push(React.createElement(Row, {
      key: "e:" + String(id),
      t,
      title: entry.moduleName ?? String(id),
      subtitle: phase,
      enabled: entry.enabled,
      readOnly: entry.entryId === undefined || entry.readOnlyReason !== undefined,
      onToggle: (next) => { run(props.setPluginEnabled(entry.entryId, next)); },
    }));
  }

  return React.createElement("div", { style: S.page }, children);
}

/** 装上：隐藏侧栏行、加设置分区、改写分区名。 */
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-plugin-entry: dictionaries");
  const t = ctx.locale.bind(NS);

  // 1) 隐藏侧边栏那行「插件」。
  const style = document.createElement("style");
  style.setAttribute("data-jx-plugin-entry", "1");
  style.textContent = `${SIDEBAR_ROW_SELECTOR}{display:none !important}`;
  document.head.append(style);

  // 2) 设置左侧多一个「插件管理」分区（与「内置组件」同级）。
  const unwrap = (result) => {
    if (result !== null && typeof result === "object" && "ok" in result) {
      if (result.ok !== true) {
        const code = result.error === undefined ? "remote" : String(result.error.code);
        const message = result.error === undefined ? "" : String(result.error.message);
        throw new Error(`${code}: ${message}`);
      }
      return result.value;
    }
    return result;
  };
  const registered = ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "pluginManager",
    order: 25,
    label: () => t("nav"),
    locale: NS,
    inject: () => ({
      t,
      listBundles: async () => unwrap(await ctx.remote.pluginManager.listBundles()),
      listPlugins: async () => unwrap(await ctx.remote.pluginManager.listPlugins()),
      setBundleEnabled: async (name, enabled) => unwrap(await ctx.remote.pluginManager.setBundleEnabled(name, enabled)),
      setPluginEnabled: async (entryId, enabled) => unwrap(await ctx.remote.pluginManager.setPluginEnabled(entryId, enabled)),
      removeBundle: async (name) => unwrap(await ctx.remote.pluginManager.removeBundle(name)),
    }),
  }, PluginManagerSection));

  // 3) 原「内置插件」分区改名「内置组件」：只替换整段完全相等的文本节点。
  const rewrite = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = (node.nodeValue ?? "").trim();
      if (text === "") continue;
      for (const pair of RENAMES) {
        if (text === pair[0]) { node.nodeValue = pair[1]; break; }
      }
    }
  };
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    const raf = window.requestAnimationFrame ?? ((cb) => window.setTimeout(cb, 16));
    raf(() => { scheduled = false; rewrite(document.body); });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  rewrite(document.body);

  return () => {
    observer.disconnect();
    style.remove();
    if (typeof registered === "function") registered();
  };
}

exports.inject = inject;
exports.apply = apply;
return module.exports; } });
