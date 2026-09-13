/**
 * 坚祥未读标记模组 —— 浏览器半边（手写官方 client bundle 格式，无需构建）。
 *
 * 外部观察者姿态（不碰官方源码、不依赖官方内部 store）：
 * - 右键侧栏会话行（[role="treeitem"]）弹出自定义菜单「标为未读 / 清除未读」；
 * - 未读集合按会话标题存 localStorage（浏览器本地，跨刷新保留）；
 * - MutationObserver + 轻轮询扫描会话树，命中行在行首注入 8px 红点（官方错误色令牌）；
 * - 左键点开未读会话行即自动清除标记。
 * 局限：按标题记忆，会话改名或重名会话会失联/连带（旧版按 id，此处为外部姿态的取舍）。
 */
window.__ModuleLoader__.load({ id: "dsh-unread", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const KEY = "dsh.jx.unread.v1"
const DOT = "jx-unread-dot"
const MENU = "jx-unread-menu"

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

function closeMenu() {
  const existing = document.getElementById(MENU)
  if (existing) existing.remove()
  document.removeEventListener("click", onDocClick, true)
  document.removeEventListener("keydown", onEsc, true)
}
function onDocClick(e) { if (!e.target.closest(`#${MENU}`)) closeMenu() }
function onEsc(e) { if (e.key === "Escape") closeMenu() }

function openMenu(x, y, title) {
  closeMenu()
  const unread = isUnread(title)
  const menu = document.createElement("div")
  menu.id = MENU
  menu.style.cssText = "position:fixed;z-index:9999;min-width:160px;padding:4px;border-radius:10px;" +
    "background:var(--dsw-alias-background-primary,#fff);" +
    "border:0.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));" +
    "box-shadow:0 8px 24px rgba(0,0,0,.16);font-size:13px"
  const item = document.createElement("div")
  item.textContent = unread ? "清除未读标记" : "标为未读"
  item.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer;" +
    "color:var(--dsw-alias-label-primary,inherit)"
  const dot = document.createElement("span")
  dot.style.cssText = "width:8px;height:8px;border-radius:50%;flex:none;" +
    `background:${unread ? "var(--dsw-alias-label-tertiary,#999)" : "var(--dsw-alias-state-error-primary,#e5484d)"}`
  item.prepend(dot)
  item.addEventListener("mouseenter", () => { item.style.background = "color-mix(in srgb, currentColor 8%, transparent)" })
  item.addEventListener("mouseleave", () => { item.style.background = "transparent" })
  item.addEventListener("click", () => {
    if (unread) unmark(title)
    else mark(title)
    closeMenu()
    syncRows(document)
  })
  menu.appendChild(item)
  document.body.appendChild(menu)
  // 贴边收敛
  const rect = menu.getBoundingClientRect()
  menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`
  menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`
  setTimeout(() => {
    document.addEventListener("click", onDocClick, true)
    document.addEventListener("keydown", onEsc, true)
  }, 0)
}

function onContextMenu(e) {
  const row = e.target && e.target.closest ? e.target.closest('[role="treeitem"]') : null
  if (!row) return
  const title = titleOf(row)
  if (!title) return
  e.preventDefault()
  openMenu(e.clientX, e.clientY, title)
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
    observer = new MutationObserver(() => syncRows(document))
    observer.observe(document.body, { childList: true, subtree: true })
    poll = setInterval(() => syncRows(document), 1500)
    document.addEventListener("contextmenu", onContextMenu, true)
    document.addEventListener("click", onClick, true)
    syncRows(document)
  }
  if (document.body) start()
  else setTimeout(start, 300)
  // 返回卸载清理（框架在插件停用时调用）
  return () => {
    if (observer) observer.disconnect()
    if (poll) clearInterval(poll)
    document.removeEventListener("contextmenu", onContextMenu, true)
    document.removeEventListener("click", onClick, true)
    closeMenu()
    for (const dot of document.querySelectorAll(`[${DOT}]`)) dot.remove()
  }
}

exports.inject = inject
exports.apply = apply
return module.exports; } })
