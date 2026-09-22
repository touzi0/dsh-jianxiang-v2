/**
 * 「新工作任务」文案模组 —— 浏览器半边（手写官方 client bundle 格式，无需构建）。
 *
 * 官方正道：客户端 locale 服务原生支持「语言包插件」（packages/client/locale 的
 * addLanguage + register(ns, locale, dict) 单语言形式就是为它设计的）。本模组注册
 * 两个官方「中文 / English」的变体语言，只覆盖「新会话 / 新建会话」相关的几个键：
 *
 *   zh-jx（显示名「中文·坚祥」，fallback zh）
 *   en-jx（显示名「English·Jianxiang」，fallback en）
 *
 * 词典查找链是 zh-jx → zh → en（packages/client/locale/src/client/index.ts 的
 * fallbackChain），所以变体里没写的键自动落回官方译文，其余界面一个字都不变；
 * 切回官方「中文 / English」则完全复原，切换由 locale 服务的 revision 驱动刷新。
 * 不做任何 DOM 文本匹配（《修改记录》里按文本猜文案的插件踩过重复行的坑）。
 *
 * 装上后自动把当前语言迁到变体（仅一次，localStorage 记号）；用户之后在
 * 设置 → 通用 → 语言 里选了别的语言，本模组不再干预。
 */
window.__ModuleLoader__.load({ id: "dsh-new-task-label", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

/** 一次性迁移的 localStorage 记号。 */
const MARK = "jx.new-task-label.migrated.v1";

/** 中文变体的语言 id 与显示名。 */
const ZH_ID = "zh-jx";
const ZH_LABEL = "中文·坚祥";

/** 英文变体的语言 id 与显示名。 */
const EN_ID = "en-jx";
const EN_LABEL = "English·Jianxiang";

/**
 * 覆盖的官方键（key 与官方词典逐字对应）：
 *   sidebar ns —— packages/client/ui-sidebar/src/client/locales.ts
 *     session.new      宽态侧栏按钮文字（「新会话」）
 *     session.new.label  按钮的 aria-label 与折叠态 tooltip（「新建会话」）
 *   workspace ns —— packages/client/ui-workspace/src/client/locales.ts
 *     session.new            空白会话节点在列表里的标题（「新会话」）
 *     actions.newSession.aria  行按钮 aria（「在“{name}”中新建会话」）
 */
const SIDEBAR_ZH = {
  "session.new": "新工作任务",
  "session.new.label": "新工作任务",
};
const SIDEBAR_EN = {
  "session.new": "New Work Task",
  "session.new.label": "New work task",
};
const WORKSPACE_ZH = {
  "session.new": "新工作任务",
  "actions.newSession.aria": "在“{name}”中新建工作任务",
};
const WORKSPACE_EN = {
  "session.new": "New Work Task",
  "actions.newSession.aria": "New work task in {name}",
};

/** 依赖的客户端服务。 */
const inject = ["locale"];

/** 把当前语言一次性迁到带「新工作任务」的变体；之后不再干预用户的选择。 */
function migrateOnce(locale) {
  let store;
  try { store = window.localStorage; } catch { return }
  if (store === undefined || store === null) return
  try {
    if (store.getItem(MARK) === "1") return
    const active = locale.getLocale().active;
    if (active === "zh") locale.setLocale(ZH_ID);
    else if (active === "en") locale.setLocale(EN_ID);
    store.setItem(MARK, "1");
  } catch (error) {
    console.warn("[dsh-new-task-label] 语言迁移失败（不影响词典注册）:", error);
  }
}

/** 装上语言包：注册两个变体语言与它们的词典，再做一次性迁移。 */
function apply(ctx) {
  const locale = ctx.locale;

  // 1) 变体语言本身（重复加载时官方会抛 "already registered"，这里先查再注）。
  const known = new Set(locale.getLocale().locales.map((item) => item.id));
  try {
    if (!known.has(ZH_ID)) locale.addLanguage({ id: ZH_ID, label: ZH_LABEL, fallback: "zh" });
    if (!known.has(EN_ID)) locale.addLanguage({ id: EN_ID, label: EN_LABEL, fallback: "en" });
  } catch (error) {
    console.warn("[dsh-new-task-label] 注册变体语言失败:", error);
  }

  // 2) 两个官方命名空间里各键的变体译文。同 (ns, locale) 重复注册官方会抛错，
  //    捕获后只告警——说明另一份本模组副本已在跑，语义不变。
  const disposers = [];
  const tryRegister = (ns, localeId, dict) => {
    try { disposers.push(locale.register(ns, localeId, dict)); } catch (error) {
      console.warn(`[dsh-new-task-label] 词典 ${ns}/${localeId} 已被占用，跳过:`, error);
    }
  };
  tryRegister("sidebar", ZH_ID, SIDEBAR_ZH);
  tryRegister("sidebar", EN_ID, SIDEBAR_EN);
  tryRegister("workspace", ZH_ID, WORKSPACE_ZH);
  tryRegister("workspace", EN_ID, WORKSPACE_EN);

  // 3) 一次性迁移当前语言；词典注册/卸载交给 ctx.effect 管理。
  migrateOnce(locale);

  return () => {
    for (const dispose of disposers) {
      try { dispose(); } catch { /* 卸载期的清理失败不阻塞拆除 */ }
    }
  };
}

exports.inject = inject;
exports.apply = apply;
return module.exports; } });
