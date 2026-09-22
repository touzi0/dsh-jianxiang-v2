/**
 * 坚祥未读标记模组 v2 —— 浏览器半边（手写官方 client bundle 格式，无需构建）。
 *
 * 外部观察者姿态（不碰官方源码、不依赖官方内部 store）：
 * - 「标为未读 / 清除未读」直接注入官方会话行三点菜单（重命名与分叉会话之间，
 *   v2 起取代旧版右键自定义菜单）；菜单为 portal 挂 body 的 div[role="menu"]，
 *   通过含「分叉会话/Fork session」项识别会话行菜单，克隆相邻 itemWrap 保持官方样式；
 * - 未读集合按会话标题存 localStorage（浏览器本地，跨刷新保留）；
 * - MutationObserver + 轻轮询扫描会话树，命中行在行首注入 8px 红点（官方错误色令牌）；
 * - 左键点开未读会话行即自动清除标记。
 * 局限：按标题记忆，会话改名或重名会话会失联/连带（官方行 DOM 无 session id 可依）。
 */
window.__ModuleLoader__.load({ id: "dsh-unread", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const KEY = "dsh.jx.unread.v1"
const DOT = "jx-unread-dot"
const ITEM = "jx-unread-item"

// 官方会话行菜单三兄弟的文案（中英），用于识别菜单与插入位置。
const RENAME_LABELS = ["重命名", "Rename"]
const FORK_LABELS = ["分叉会话", "Fork session"]

const inject = []

function loadState() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v === "object" ? v : {} } catch { return {} }
}
function saveState(s) { localStorage.setItem(KEY, JSON.stringify(s)) }
function isUnread(title) { return Object.prototype.hasOwnProperty.call(loadState(), title) }
function mark(title) { const s = loadState(); s[title] = Date.now(); saveState(s) }
function unmark(title) { const s = loadState(); delete s[title]; saveState(s) }

/** 行内最长的 span 文本作为会话标题（标题长于时间戳/状态尾巴）。 */
function titleOf(row) {
  let best = ""
  for (const span of row.querySelectorAll("span")) {
    const text = (span.textContent || "").trim()
    if (text.length > best.length) best = text
  }
  return best
}

function ensureDot(row) {
  if (row.querySelector(`[${DOT}]`)) return
  const dot = document.createElement("span")
  dot.setAttribute(DOT, "")
  dot.style.cssText = "flex:none;width:8px;height:8px;margin:0 4px 0 2px;border-radius:50%;" +
    "background:var(--dsw-alias-state-error-primary,#e5484d);align-self:center"
  row.prepend(dot)
}

function syncRows(root) {
  const state = loadState()
  const titles = Object.keys(state)
  if (titles.length === 0) {
    for (const dot of root.querySelectorAll(`[${DOT}]`)) dot.remove()
    return
  }
  for (const row of root.querySelectorAll('[role="treeitem"]')) {
    const title = titleOf(row)
    if (titles.includes(title)) ensureDot(row)
    else {
      const dot = row.querySelector(`[${DOT}]`)
      if (dot) dot.remove()
    }
  }
}

// —— 官方三点菜单注入 ——

/** 最近一次被按下的会话行标题：三点按钮在行内，portal 菜单本身不带行信息。 */
let lastRowTitle = ""

function onPointerDown(e) {
  const row = e.target && e.target.closest ? e.target.closest('[role="treeitem"]') : null
  if (row) {
    const title = titleOf(row)
    if (title) lastRowTitle = title
  }
}

function labelOf(button) {
  return (button.textContent || "").trim()
}

function findButtonByLabels(menu, labels) {
  for (const button of menu.querySelectorAll('button[role="menuitem"]')) {
    if (labels.includes(labelOf(button))) return button
  }
  return null
}

/** 在重命名与分叉会话之间插入「标为未读/清除未读」。克隆分叉项结构保官方观感。 */
function injectMenuItem(menu) {
  if (menu.querySelector(`[${ITEM}]`)) return
  const fork = findButtonByLabels(menu, FORK_LABELS)
  if (fork === null) return
  const rename = findButtonByLabels(menu, RENAME_LABELS)
  if (rename === null) return
  const title = lastRowTitle
  if (!title) return

  const wrap = fork.parentElement.cloneNode(true)
  wrap.setAttribute(ITEM, "")
  const button = wrap.querySelector("button")
  if (button === null) return
  button.setAttribute("aria-label", title)
  const unread = isUnread(title)
  const labelSpan = Array.from(button.querySelectorAll("span")).at(-1)
  if (labelSpan !== undefined) labelSpan.textContent = unread ? "清除未读标记" : "标为未读"
  const iconSpan = button.querySelector("span")
  if (iconSpan !== null) {
    iconSpan.replaceChildren()
    const dot = document.createElement("span")
    dot.style.cssText = "display:block;width:8px;height:8px;border-radius:50%;" +
      `background:${unread ? "var(--dsw-alias-label-tertiary,#999)" : "var(--dsw-alias-state-error-primary,#e5484d)"}`
    iconSpan.appendChild(dot)
  }
  button.addEventListener("click", (e) => {
    e.stopPropagation()
    if (isUnread(title)) unmark(title)
    else mark(title)
    syncRows(document)
    // 官方菜单点击后自动收起：模拟选中行为即可，菜单由 React 自行关闭。
    const click = new PointerEvent("pointerdown", { bubbles: true })
    document.dispatchEvent(click)
  })
  fork.parentElement.parentElement.insertBefore(wrap, fork.parentElement)
}

/** 全量扫描 body 下的 portal 菜单（三点菜单每次打开都是新节点）。 */
function scanMenus() {
  for (const menu of document.querySelectorAll('body > div[role="menu"]')) injectMenuItem(menu)
}

function onClick(e) {
  const row = e.target && e.target.closest ? e.target.closest('[role="treeitem"]') : null
  if (!row) return
  const title = titleOf(row)
  if (title && isUnread(title)) {
    unmark(title)
    const dot = row.querySelector(`[${DOT}]`)
    if (dot) dot.remove()
  }
}

let observer = null
let poll = null

function apply(ctx) {
  const start = () => {
    observer = new MutationObserver(() => { syncRows(document); scanMenus() })
    observer.observe(document.body, { childList: true, subtree: true })
    poll = setInterval(() => { syncRows(document); scanMenus() }, 1500)
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("click", onClick, true)
    syncRows(document)
  }
  if (document.body) start()
  else setTimeout(start, 300)
  // 返回卸载清理（框架在插件停用时调用）
  return () => {
    if (observer) observer.disconnect()
    if (poll) clearInterval(poll)
    document.removeEventListener("pointerdown", onPointerDown, true)
    document.removeEventListener("click", onClick, true)
    for (const dot of document.querySelectorAll(`[${DOT}]`)) dot.remove()
    for (const item of document.querySelectorAll(`[${ITEM}]`)) item.remove()
  }
}

exports.inject = inject
exports.apply = apply
return module.exports; } })
