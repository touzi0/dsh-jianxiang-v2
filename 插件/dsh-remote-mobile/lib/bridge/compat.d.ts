/**
 * 远程移动端接入底座兼容性与上下文虚拟化桥接层 (Bridge & Compatibility Virtualizer)
 *
 * 【设计职责】
 * 本模块集中封装所有针对 DSH 底座及第三方生态插件（如 @linxin666/dsh-ssh, @linxin666/dsh-pet, @linxin666/dsh-client-ui-task-board 等）
 * 的兼容性支持逻辑与网络上下文虚拟化代理，主要包含三大核心能力：
 *
 * 1. 【前端安全上下文 Polyfill 物理注入 (Crypto Polyfill Injection)】：
 *    - 解决现代浏览器在非安全上下文（HTTP + 外部 IP，如 Tailscale/局域网）下禁用 window.crypto.randomUUID() 的规范限制；
 *    - 在服务端通过 HTML <head> 顶部首行注入 Polyfill 脚本，确保在所有业务与核心 RPC 客户端执行前 100% 就绪。
 *
 * 2. 【底层 HTTP 门禁劫持与回环上下文虚拟化 (Loopback Context Virtualizer)】：
 *    - 挂载全链路 HTTP 门禁中间件，对未授权请求实施 302 重定向到 /auth 或 401 拦截；
 *    - 对通过认证（已扫码配对 / 长期密码 / 免密直连）的外部请求，在进入下游各业务插件前，
 *      统一将 Host、Origin、Socket RemoteAddress 及 Sec-Fetch-Site 规范化虚拟为 127.0.0.1 回环特征，
 *      解除底层 WebServer 的 DNS-Rebinding 阻断以及第三方插件写死的 loopback-only 403 限制；
 *    - 本机回环 socket（127.0.0.1 / ::1）不做上述洗白：保留原始 Host / Origin / Sec-Fetch-Site，
 *      让下游自身的同源与 DNS-Rebinding 校验继续生效，阻断恶意网页借道本机发起的跨站写攻击。
 *
 * 3. 【移动端样式片段注入 (Mobile Style Snippets Injection)】：
 *    - 在网关响应层按 User-Agent 判定移动端，向主工作区 index.html 与 /auth 登录页
 *      注入可拼装去重的 CSS 片段（内置预设 + 用户自定义，见 styles/style-snippets.ts），
 *      并给 <html> 打上 data-dsh-mobile 标记供样式选择器使用。
 *
 * 4. 【Cordis 服务桥接 (remoteWebUiPairing Bridge)】：
 *    - 以标准 Cordis Service 模式向全局暴露 remoteWebUiPairing 服务；
 *    - 该名称是远程/Web 接入类插件的通用共享服务名，可能与其他同类插件冲突，
 *      采用「延迟裁决」策略：等待激活窗口结束后检测服务名归属，
 *      已被占用则主动让出并置冲突标记（设置页展示警示横幅），无人注册才接管；
 *    - 判定基于 Cordis 公开运行时结构（服务占用 + fiber 运行态），不针对特定插件；
 *    - 保证与其他远程接入类插件共存时必定可以正常启动（不再触发整树回滚致命错误）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SessionStore } from '../auth/token.js';
import { type StyleSnippetStore } from '../styles/style-snippets.js';
/**
 * 注入到 index.html <head> 最前列的 Polyfill 脚本代码片段
 * 针对非安全上下文（HTTP + 外部 IP）提供轻量高精度的 UUID v4 生成能力
 */
export declare const CRYPTO_POLYFILL_SNIPPET = "\n(function() {\n  if (typeof window !== \"undefined\") {\n    if (!window.crypto) window.crypto = {};\n    if (typeof window.crypto.randomUUID !== \"function\") {\n      window.crypto.randomUUID = function() {\n        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {\n          var r = Math.random() * 16 | 0;\n          var v = c === 'x' ? r : (r & 0x3 | 0x8);\n          return v.toString(16);\n        });\n      };\n    }\n  }\n})();\n";
/**
 * 注入到 index.html <head> 最前列的 Clipboard API Polyfill 脚本
 * 针对非安全上下文（HTTP + 外部 IP，如 Tailscale / 局域网）下
 * navigator.clipboard 为 undefined 的场景：提供 execCommand('copy') 降级实现，
 * 避免官方 bundle 直接调用 navigator.clipboard.writeText 时抛
 * "Cannot read properties of undefined (reading 'writeText')" 崩溃。
 * 原生可用时不做任何替换。
 */
export declare const CLIPBOARD_POLYFILL_SNIPPET = "\n(function() {\n  if (typeof navigator === \"undefined\") return;\n  try {\n    if (navigator.clipboard && typeof navigator.clipboard.writeText === \"function\") return;\n    var writeText = function(text) {\n      try {\n        var ta = document.createElement('textarea');\n        ta.value = String(text == null ? '' : text);\n        ta.setAttribute('readonly', '');\n        ta.style.position = 'fixed';\n        ta.style.top = '-9999px';\n        ta.style.left = '-9999px';\n        document.body.appendChild(ta);\n        ta.select();\n        var ok = document.execCommand('copy');\n        document.body.removeChild(ta);\n        return ok ? Promise.resolve() : Promise.reject(new Error('copy failed'));\n      } catch (err) {\n        return Promise.reject(err);\n      }\n    };\n    var readText = function() {\n      return Promise.reject(new Error('clipboard readText is not supported in insecure context'));\n    };\n    try {\n      if (!navigator.clipboard) navigator.clipboard = {};\n      if (typeof navigator.clipboard.writeText !== \"function\") navigator.clipboard.writeText = writeText;\n      if (typeof navigator.clipboard.readText !== \"function\") navigator.clipboard.readText = readText;\n    } catch (err) {\n      try {\n        Object.defineProperty(navigator, 'clipboard', {\n          value: { writeText: writeText, readText: readText },\n          configurable: true,\n        });\n      } catch (err2) {}\n    }\n  } catch (err) {}\n})();\n";
/**
 * 注入到 index.html <head> 最前列的生态插件 remote-web-ui 移动端冲突防护脚本
 * 写入 sessionStorage 'dsh-remote-force-desktop' = '1'，触发对方内置的强制桌面跳过机制，
 * 避免生态插件重复渲染小鲸鱼按钮 (#dshRemoteWhale) 以及引发手势拦截冲突
 */
export declare const FORCE_DESKTOP_SUPPRESSION_SNIPPET = "\n(function() {\n  try {\n    if (typeof window !== \"undefined\" && window.sessionStorage) {\n      window.sessionStorage.setItem('dsh-remote-force-desktop', '1');\n    }\n  } catch (e) {}\n})();\n";
/**
 * 注入到 index.html 的移动端悬浮入口拖拽与位置记忆脚本
 * 允许用户在移动端上下随心拖动左上角入口把手，避免遮挡聊天内容，并自动保存位置
 */
export declare const DRAGGABLE_NAV_SNIPPET = "\n(function() {\n  if (typeof window === \"undefined\" || typeof document === \"undefined\") return;\n\n  /* ===== \u9632\u8BEF\u6536\u8D77\u5B88\u536B =====\n   * \u7B2C\u4E09\u65B9\u751F\u6001\u63D2\u4EF6\uFF08\u5982 @linxin666/dsh-web-ui-all \u7684\u79FB\u52A8\u7AEF\u62BD\u5C49\u589E\u5F3A\uFF09\u4F1A\u5728\u7528\u6237\u70B9\u51FB\n   * \u4FA7\u8FB9\u680F\u6761\u76EE\uFF08role=treeitem\uFF09\u540E\uFF0C\u4E8E\u4E0B\u4E00\u5E27\u7A0B\u5E8F\u5316\u70B9\u51FB\u300C\u6536\u8D77\u4FA7\u8FB9\u680F\u300D\u6309\u94AE\u81EA\u52A8\u6536\u56DE\u62BD\u5C49\u3002\n   * \u8BE5\u5224\u5B9A\u65E0\u6CD5\u533A\u5206\u300C\u9009\u4E2D\u6761\u76EE\u56DE\u4E3B\u533A\u300D\u4E0E\u300C\u70B9\u51FB\u6761\u76EE\u5185\u7684\u6B21\u7EA7\u64CD\u4F5C\u56FE\u6807\u300D\uFF08\u66F4\u591A\u64CD\u4F5C \u22EF /\n   * \u5C55\u5F00\u7BAD\u5934\u7B49\uFF09\uFF0C\u5BFC\u81F4\u540E\u8005\u62BD\u5C49\u88AB\u8BEF\u5173\u3002\n   * \u8FD9\u91CC\u8BB0\u5F55\u6700\u8FD1\u4E00\u6B21\u5BF9\u6761\u76EE\u5185\u4EFB\u610F\u90E8\u4F4D\uFF08\u9879\u76EE\u540D\u79F0\u4E3B\u4F53 / \u6B21\u7EA7\u6309\u94AE / \u7BAD\u5934\u56FE\u6807\uFF09\u7684\u89E6\u6478\u65F6\u95F4\uFF0C\n   * \u5E76\u5305\u88C5 HTMLButtonElement.prototype.click\uFF1A\u77ED\u65F6\u95F4\u7A97\u53E3\u5185\u7684\u7A0B\u5E8F\u5316\u6536\u8D77\u8C03\u7528\u76F4\u63A5\u5FFD\u7565\u3002\n   * \u8986\u76D6\u6761\u76EE\u4E3B\u4F53\u662F\u4E3A\u4E86\u8BA9\u9009\u4E2D\u9AD8\u4EAE\u540E\u6D6E\u73B0\u7684\u5C55\u5F00/\u6536\u8D77\u7BAD\u5934\u4E0E\u65B0\u589E/\u66F4\u591A\u64CD\u4F5C\u56FE\u6807\u6709\u8DB3\u591F\u7684\n   * \u505C\u7559\u64CD\u4F5C\u65F6\u95F4\uFF1B\u7528\u6237\u771F\u5B9E\u70B9\u51FB\u6536\u8D77\u6309\u94AE\uFF08\u6D4F\u89C8\u5668\u5408\u6210\u4E8B\u4EF6\u4E0D\u8D70 prototype.click\uFF09\u4E0E\n   * \u70B9\u51FB\u62BD\u5C49\u5916\u6697\u5904\u6536\u8D77\u7684\u5B98\u65B9\u884C\u4E3A\u5747\u4E0D\u53D7\u5F71\u54CD\u3002 */\n  if (!window.__dshRmAntiCollapseInstalled__) {\n    window.__dshRmAntiCollapseInstalled__ = true;\n    var lastEntryTapAt = 0;\n    document.addEventListener('pointerdown', function (e) {\n      try {\n        var t = e.target;\n        if (!t || !t.closest) return;\n        if (!t.closest('[data-pane=\"sidebar\"], [class*=\"_sidebarCol\"]')) return;\n\n        // \u4F1A\u8BDD\u6761\u76EE\uFF08_sessionRow\uFF09\u9664\u64CD\u4F5C\u6309\u94AE\uFF08_rowActions/button\u7B49\uFF09\u4EE5\u5916\u7684\u4E3B\u4F53\u70B9\u51FB\uFF1A\n        // \u7528\u6237\u610F\u5728\u8FDB\u5165/\u5207\u6362\u4F1A\u8BDD\u5E76\u67E5\u770B\u6B63\u6587\uFF0C\u4E0D\u62E6\u622A\u7A0B\u5E8F\u5316\u6536\u8D77\uFF08\u653E\u884C\u81EA\u52A8\u56DE\u4E3B\u533A\uFF09\n        var isSessionRow = t.closest('[class*=\"_sessionRow\"]');\n        var isActionOrToggle = t.closest('[class*=\"_rowActions\"], [class*=\"_chevron\"], [class*=\"_arrow\"], button, [role=\"button\"]');\n        if (isSessionRow && !isActionOrToggle) {\n          lastEntryTapAt = 0;\n          return;\n        }\n\n        var entry = t.closest('[role=\"treeitem\"], [data-dsh-part=\"sidebar-entry\"]');\n        if (!entry) return;\n        lastEntryTapAt = Date.now();\n      } catch (err) {}\n    }, { capture: true, passive: true });\n\n    var protoClick = HTMLButtonElement.prototype.click;\n    HTMLButtonElement.prototype.click = function () {\n      try {\n        var isSidebarToggle =\n          this.matches('[data-dsh-responsive-part=\"sidebar-toggle\"]') ||\n          /\u6536\u8D77\u4FA7\u8FB9\u680F|Collapse sidebar|Open sidebar/i.test(this.getAttribute('aria-label') || '');\n        if (isSidebarToggle && Date.now() - lastEntryTapAt < 900) {\n          return; // \u541E\u6389\u7D27\u968F\u5DE5\u4F5C\u533A/\u64CD\u4F5C\u63A7\u4EF6\u70B9\u51FB\u4E4B\u540E\u7684\u7A0B\u5E8F\u5316\u6536\u8D77\n        }\n      } catch (err) {}\n      return protoClick.apply(this, arguments);\n    };\n  }\n\n  function initDraggableNav() {\n    var logoRow = document.querySelector('[data-pane=\"sidebar\"] [class*=\"_logoRow\"], [class*=\"_sidebarCol\"] [class*=\"_logoRow\"]');\n    if (!logoRow || logoRow.__dsh_drag_init__) return;\n    logoRow.__dsh_drag_init__ = true;\n\n    var savedTop = localStorage.getItem('dsh_mobile_nav_top');\n    if (savedTop && !isNaN(Number(savedTop))) {\n      var topVal = Math.max(10, Math.min(window.innerHeight - 60, Number(savedTop)));\n      logoRow.style.setProperty('top', topVal + 'px', 'important');\n    }\n\n    var startY = 0;\n    var initialTop = 0;\n    var isDragging = false;\n    var hasMoved = false;\n\n    function onTouchStart(e) {\n      var sidebar = document.querySelector('[data-pane=\"sidebar\"], [class*=\"_sidebarCol\"]');\n      if (sidebar && !sidebar.querySelector('[class*=\"_collapsed\"]')) return;\n\n      var touch = e.touches ? e.touches[0] : e;\n      startY = touch.clientY;\n      var rect = logoRow.getBoundingClientRect();\n      initialTop = rect.top;\n      isDragging = true;\n      hasMoved = false;\n    }\n\n    function onTouchMove(e) {\n      if (!isDragging) return;\n      var touch = e.touches ? e.touches[0] : e;\n      var deltaY = touch.clientY - startY;\n\n      if (!hasMoved && Math.abs(deltaY) > 5) {\n        hasMoved = true;\n      }\n\n      if (hasMoved) {\n        if (e.cancelable) e.preventDefault();\n        var newTop = initialTop + deltaY;\n        var minTop = 10;\n        var maxTop = window.innerHeight - 56;\n        newTop = Math.max(minTop, Math.min(maxTop, newTop));\n        logoRow.style.setProperty('top', newTop + 'px', 'important');\n      }\n    }\n\n    function onTouchEnd(e) {\n      if (!isDragging) return;\n      isDragging = false;\n      if (hasMoved) {\n        e.preventDefault();\n        e.stopPropagation();\n        var currentRect = logoRow.getBoundingClientRect();\n        try {\n          localStorage.setItem('dsh_mobile_nav_top', String(Math.round(currentRect.top)));\n        } catch (err) {}\n      }\n    }\n\n    logoRow.addEventListener('touchstart', onTouchStart, { passive: true });\n    window.addEventListener('touchmove', onTouchMove, { passive: false });\n    window.addEventListener('touchend', onTouchEnd, { capture: true });\n\n    logoRow.addEventListener('mousedown', onTouchStart);\n    window.addEventListener('mousemove', onTouchMove);\n    window.addEventListener('mouseup', onTouchEnd, { capture: true });\n  }\n\n  if (document.readyState === 'loading') {\n    document.addEventListener('DOMContentLoaded', initDraggableNav);\n  } else {\n    initDraggableNav();\n  }\n  setInterval(initDraggableNav, 800);\n})();\n";
/**
 * 注入到 index.html 的移动端抽屉「点外部收起」脚本
 *
 * 【设计职责】
 * 仅当 @linxin666/dsh-web-ui-all 未启用时生效——web-ui 已自带 installMobileSidebarDismiss，
 * 本脚本通过检测 style[data-dsh-compat="responsive"] 动态让位，绝不与 web-ui 叠加双份收起逻辑。
 *
 * 定位全部基于官方 CSS Modules 稳定后缀（_frame / _sidebarCol / _toggle，前缀 hash 随机、
 * 后缀稳定），不依赖 web-ui 注入的 data-pane / data-dsh-frame 属性，因此装/不装 web-ui
 * 两种环境行为一致。折叠状态沿用官方写入的 data-sidebar-collapsed 属性。
 */
export declare const MOBILE_DISMISS_SNIPPET = "\n(function() {\n  if (typeof window === \"undefined\" || typeof document === \"undefined\") return;\n\n  var frameSelector = '[class*=\"_frame\"]';\n  var sidebarSelector = '[class*=\"_sidebarCol\"]';\n\n  function webUiOwnsDrawer() {\n    return !!document.querySelector('style[data-dsh-compat=\"responsive\"]');\n  }\n\n  function findToggle(frame) {\n    return frame.querySelector('[class*=\"_toggle\"]') ||\n      Array.prototype.filter.call(frame.querySelectorAll('button'), function (b) {\n        return /\u6536\u8D77\u4FA7\u8FB9\u680F|Collapse sidebar|Open sidebar/i.test(b.getAttribute('aria-label') || '');\n      })[0] || null;\n  }\n\n  function install(frame) {\n    if (frame.__dshRmDismissInstalled__) return;\n    frame.__dshRmDismissInstalled__ = true;\n    var raf = 0;\n\n    frame.addEventListener('click', function (event) {\n      try {\n        // web-ui \u53EF\u80FD\u8FD0\u884C\u4E2D\u624D\u6CE8\u5165 responsive style\uFF1A\u6BCF\u6B21\u4E8B\u4EF6\u90FD\u590D\u67E5\uFF0C\u52A8\u6001\u8BA9\u4F4D\n        if (webUiOwnsDrawer()) return;\n        var target = event.target;\n        if (!target || !(target instanceof Element)) return;\n        if (typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 900px)').matches) return;\n        var sidebar = frame.querySelector(sidebarSelector);\n        var toggle = findToggle(frame);\n        if (!sidebar || !toggle) return;\n\n        // \u62BD\u5C49\u5C55\u5F00\u65F6\u70B9\u51FB\u6B63\u6587\uFF08sidebar \u5916\uFF09\u2192 \u89E6\u53D1\u5B98\u65B9\u6536\u8D77\u6309\u94AE\uFF0C\u5E76\u62E6\u622A\u88AB\u541E\u6389\u7684\u70B9\u51FB\uFF1B\n        // \u627E\u4E0D\u5230\u6536\u8D77\u6309\u94AE\u65F6\u4E0A\u9762\u5DF2 return\uFF0C\u7EDD\u4E0D\u8BEF\u62E6\u6B63\u6587\u4EA4\u4E92\uFF1B\n        // \u589E\u52A0\u5BF9 sidebar \u5185\u90E8 _collapsed \u7684\u72B6\u6001\u6821\u9A8C\uFF0C\u53CC\u91CD\u4FDD\u8BC1\u4EC5\u5728\u4FA7\u8FB9\u680F\u771F\u6B63\u5C55\u5F00\u65F6\u624D\u62E6\u622A\u6B63\u6587\u70B9\u51FB\n        var isSidebarOpen = !frame.hasAttribute('data-sidebar-collapsed') && !sidebar.querySelector('[class*=\"_collapsed\"]');\n        if (isSidebarOpen && !sidebar.contains(target)) {\n          event.preventDefault();\n          event.stopPropagation();\n          toggle.click();\n          return;\n        }\n        // \u70B9\u51FB\u4FA7\u8FB9\u680F\u5185\u6B21\u7EA7\u64CD\u4F5C\u56FE\u6807\uFF08\u66F4\u591A\u64CD\u4F5C \u22EF / \u5C55\u5F00\u7BAD\u5934\u7B49\uFF09\u3001\u5DE5\u4F5C\u533A\u884C\uFF08_projectRow\uFF09\u6216\u539F\u751F\u5207\u6362\u6309\u94AE \u2192 \u4E0D\u6536\u8D77\u62BD\u5C49\n        if (target.closest('[class*=\"_toggle\"], [class*=\"_rowActions\"], [class*=\"_projectRow\"], [class*=\"_chevron\"], [class*=\"_arrow\"], button, [role=\"button\"]')) return;\n        // \u70B9\u51FB\u4F1A\u8BDD\u6761\u76EE\uFF08_sessionRow\uFF09\u4E3B\u4F53\uFF08\u9009\u4E2D\u4F1A\u8BDD\u540E\u56DE\u4E3B\u533A\uFF09\u2192 \u4E0B\u4E00\u5E27\u7A0B\u5E8F\u5316\u6536\u8D77\n        if (!target.closest('[class*=\"_sessionRow\"], [role=\"treeitem\"], [data-dsh-part=\"sidebar-entry\"]')) return;\n        if (raf !== 0) cancelAnimationFrame(raf);\n        raf = requestAnimationFrame(function () {\n          raf = 0;\n          if (!frame.hasAttribute('data-sidebar-collapsed')) toggle.click();\n        });\n      } catch (err) {}\n    }, true);\n  }\n\n  function ensure() {\n    if (webUiOwnsDrawer()) return;\n    var frame = document.querySelector(frameSelector);\n    if (frame) install(frame);\n  }\n\n  if (document.readyState === 'loading') {\n    document.addEventListener('DOMContentLoaded', ensure);\n  } else {\n    ensure();\n  }\n  setInterval(ensure, 800);\n})();\n";
/**
 * 挂载底层 http.Server 门禁劫持与回环上下文虚拟化代理
 *
 * @param server - 底层 Node.js http.Server 实例
 * @param gateMiddleware - 全局安全门禁拦截器函数
 * @param store - 会话与配置管理器实例
 */
export declare function patchHttpServerWithVirtualizer(server: any, gateMiddleware: (req: IncomingMessage, res: ServerResponse, next?: () => void) => boolean, _store: SessionStore, styleStore?: StyleSnippetStore): void;
/**
 * 注册 WebServer HTML 模板层的 Polyfill 注入钩子
 *
 * @param ctx - Cordis 上下文对象
 */
export declare function mountIndexInjections(ctx: any): void;
/**
 * 配对桥接服务的运行时裁决状态（供 /status 接口与设置页横幅读取）
 *
 * - pending：激活窗口裁决尚未完成（启动后极短时间内的过渡态）
 * - active ：本插件已成功提供 remoteWebUiPairing 服务
 * - yielded：检测到其他插件已注册同名服务，本插件主动让出
 */
export type PairingBridgeMode = 'pending' | 'active' | 'yielded';
export interface PairingBridgeState {
    mode: PairingBridgeMode;
    /** 占用服务的插件包名（可识别时）；无法识别提供方时为 null，前端回退为通用文案 */
    conflictWith: string | null;
    /** 占用方的 loader entry id（可识别时），用于生成精确的 disabled: true 修复配置 */
    conflictEntryId: string | null;
}
/** 读取配对桥接当前裁决状态（快照） */
export declare function getPairingBridgeState(): PairingBridgeState;
/** 本插件在 loader 树中的模块名（从“兄弟 entry 尚未落定”判定中排除自身） */
export declare const PLUGIN_MODULE_NAME = "dsh-remote-mobile";
/**
 * 向 Cordis 容器桥接注册 remoteWebUiPairing 服务（延迟裁决版，通用共存保护）
 *
 * 背景：remoteWebUiPairing 是远程/Web 接入类插件的通用共享服务名（生态插件经
 * inject 消费）。任何其他插件先注册同名服务后，本插件再
 * 注册必然抛错；而 loader 以 Promise.allSettled 并发激活全部 entry，任一失败会
 * 回滚整棵插件树并使进程退出（致命）。
 *
 * 因此这里不「立即抢注」，而是轮询裁决：
 * 1. 服务名已被占用 → 让出（mode: yielded），并尽力定位提供方包名供界面提示；
 * 2. 兄弟 entry 全部落定且无人注册（未安装 / 被禁用 / 自身激活失败）→ 接管；
 * 3. 最长等待 BRIDGE_MAX_WAIT_MS 兜底；极端竞速下若注册瞬间输给对方，
 *    捕获异常同样按让出处理，绝不向外抛错。
 *
 * 判定完全基于 Cordis 公开运行时结构（服务名占用 + fiber 运行态），不针对
 * 任何特定第三方插件。
 *
 * @param ctx - Cordis 上下文对象
 * @param store - 会话管理器实例
 */
export declare function registerRemoteWebUiPairingBridge(ctx: any, store: SessionStore): void;
/**
 * 判定一个请求是否已获得 dsh-remote-mobile 门禁授权（包括回环、免密直连与已认证会话）
 */
export declare function isRequestAuthorizedByGate(req: any, store: SessionStore): boolean;
/**
 * 透明接管 DSH 官方底座的 Token 鉴权服务 (connection.browserAuth & connection.requestRejection)
 *
 * 【设计职责】
 * 官方新版在底座硬编码了临时进程 Token（dsh web: http://.../?token=xxxx）以及基于签名 Cookie 的
 * 全链路 RPC/WebSocket 401 阻断。对于已安装本插件的用户而言，两层鉴权导致体验严重割裂且使手机书签失效。
 * 本函数对底层 connection 服务实施透明短路代理：
 * 1. 凡通过本插件门禁（本机、Tailscale/LAN 免密直连、已扫码配对/长期密码认证）的请求，底座鉴权全链路放行；
 * 2. 彻底消除进程重启后移动端遭遇官方 401 的痛点，对外提供唯一定制化移动端门禁体系；
 * 3. 未授权外部请求保持官方与插件原本拦截逻辑，且保留官方原生合法 token 的交换能力。
 *
 * @param connection - DSH 底座提供的 connection 服务实例
 * @param store - 会话与配置管理器实例
 */
export declare function takeOverConnectionAuth(connection: any, store: SessionStore): void;
