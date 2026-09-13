window.__ModuleLoader__.load({ id: "dsh-user-message-float", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
let react = require("react");
let react_jsx_runtime = require("react/jsx-runtime");
//#region src/client.tsx
/**
* 用户消息浮窗（坚祥定制，原 packages/client/ui-user-message-float 迁移为模组）。
*
* 视口停在回合中段（工具调用/思考——既看不到用户消息也看不到最终回答）时，
* 把当前问题钉在会话区右上角；看到提问本身或最终回答时自动隐藏。可折叠成
* 「你的要求」药丸、长文折叠展开、滚动到顶部自动加载更早历史。
*
* 新版适配：client-runtime 已拆包（sessions 服务来自 dsh-api-session-controller）；
* chat 快照的 nodes 改为 store，遍历走 legacy.nodes（节点带 key/kind/data）。
*/
const EMPTY = Object.freeze({
	key: null,
	text: null
});
const IMAGE_ONLY = "（图片消息）";
function extractUserText(blocks) {
	const parts = [];
	let hasImage = false;
	for (const block of blocks ?? []) if (block.type === "text" && typeof block.text === "string" && block.text !== "") parts.push(block.text);
	else if (block.type === "image") hasImage = true;
	const text = parts.join("\n");
	if (text !== "") return text;
	return hasImage ? IMAGE_ONLY : "";
}
var FloatController = class {
	view = EMPTY;
	listeners = /* @__PURE__ */ new Set();
	source = {
		getSnapshot: () => this.view,
		subscribe: (fn) => {
			this.listeners.add(fn);
			return () => {
				this.listeners.delete(fn);
			};
		}
	};
	/** chat 快照 → {chat-flow key → 用户消息文本}（user 与 steering 行）。 */
	static foldChat(chat) {
		const userText = /* @__PURE__ */ new Map();
		let nodes = Array.isArray(chat?.legacy?.nodes) ? chat?.legacy?.nodes ?? [] : [];
		if (nodes.length === 0 && typeof chat?.nodes?.values === "function") try {
			nodes = chat.nodes.values();
		} catch {
			nodes = [];
		}
		for (const node of nodes) {
			if (node.kind !== "user" && node.kind !== "steering") continue;
			if (node.key === void 0) continue;
			userText.set(node.key, extractUserText(node.data?.content));
		}
		return userText;
	}
	update(scrollport, userText) {
		const chatFlow = scrollport.querySelector("[data-chat-flow]");
		if (chatFlow === null) {
			this.publish(EMPTY);
			return;
		}
		const rows = chatFlow.children;
		const rect = scrollport.getBoundingClientRect();
		const top = rect.top;
		const composer = scrollport.querySelector("[data-composer-seat]");
		const composerTop = composer === null ? Number.POSITIVE_INFINITY : composer.getBoundingClientRect().top;
		const bottom = Math.min(rect.bottom, composerTop);
		let index = -1;
		let userVisible = false;
		let processVisible = false;
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			const rowRect = row.getBoundingClientRect();
			if (index === -1 && rowRect.bottom > top + 1) index = i;
			if (rowRect.bottom <= top + 1 || rowRect.top >= bottom) continue;
			const kind = row.getAttribute("data-chat-flow-kind");
			if (kind === "user" || kind === "steering") userVisible = true;
			else if (kind === "turn-process" || kind === "tool-call") processVisible = true;
			else if (kind === "assistant-step") {
				const thinks = row.querySelectorAll("[data-variant=\"think\"]");
				for (const think of thinks) {
					const thinkRect = think.getBoundingClientRect();
					if (thinkRect.bottom > top + 1 && thinkRect.top < bottom) {
						processVisible = true;
						break;
					}
				}
			}
		}
		if (!processVisible || userVisible) {
			this.publish(EMPTY);
			return;
		}
		let found = EMPTY;
		for (let i = index; i >= 0; i--) {
			const row = rows[i];
			const kind = row.getAttribute("data-chat-flow-kind");
			if (kind !== "user" && kind !== "steering") continue;
			const key = row.getAttribute("data-chat-flow-key");
			const text = key === null ? void 0 : userText.get(key);
			if (key !== null && text !== void 0 && text !== "") found = Object.freeze({
				key,
				text
			});
			break;
		}
		this.publish(found);
	}
	clear() {
		this.publish(EMPTY);
	}
	publish(next) {
		if (next.key === this.view.key) return;
		this.view = next;
		for (const fn of [...this.listeners]) fn();
	}
};
function measurePos() {
	const layer = document.querySelector("[data-shell-overlay]");
	const scrollport = document.querySelector("[data-conversation-scroll]");
	const chatFlow = scrollport?.querySelector("[data-chat-flow]") ?? null;
	if (layer === null || scrollport === null || chatFlow === null) return null;
	const layerRect = layer.getBoundingClientRect();
	const scrollRect = scrollport.getBoundingClientRect();
	const flowRect = chatFlow.getBoundingClientRect();
	return {
		top: scrollRect.top - layerRect.top + 12,
		right: Math.max(0, layerRect.right - flowRect.right)
	};
}
const styles = {
	float: {
		position: "absolute",
		display: "flex",
		alignItems: "flex-start",
		gap: 8,
		maxWidth: "min(560px, 80vw)",
		pointerEvents: "auto"
	},
	bodyWrap: {
		minWidth: 0,
		maxWidth: "min(525px, 74vw)",
		background: "var(--dsw-specific-bubble)",
		borderRadius: 22,
		padding: "10px 16px",
		boxShadow: "0 6px 24px rgb(0 0 0 / 18%)"
	},
	body: {
		maxHeight: "40vh",
		overflowY: "auto",
		whiteSpace: "pre-wrap",
		wordBreak: "break-word",
		fontSize: 16,
		lineHeight: "24px",
		color: "var(--dsw-alias-label-primary)"
	},
	pill: {
		background: "var(--dsw-specific-bubble)",
		border: "none",
		borderRadius: 999,
		padding: "6px 14px",
		cursor: "pointer",
		color: "var(--dsw-alias-label-primary)",
		boxShadow: "0 6px 24px rgb(0 0 0 / 18%)"
	},
	clampToggle: {
		display: "block",
		margin: "2px 0 0 auto",
		padding: 0,
		border: "none",
		background: "none",
		color: "var(--dsw-alias-label-secondary)",
		fontSize: 13,
		lineHeight: "20px",
		cursor: "pointer"
	},
	close: {
		border: "none",
		background: "none",
		color: "var(--dsw-alias-label-secondary)",
		cursor: "pointer",
		fontSize: 18,
		lineHeight: 1,
		padding: 4
	}
};
function UserMessageFloat({ useFloatView, useSessions }) {
	const view = useFloatView((snapshot) => snapshot);
	const [collapsed, setCollapsed] = (0, react.useState)(false);
	const [textExpanded, setTextExpanded] = (0, react.useState)(false);
	const [overflowing, setOverflowing] = (0, react.useState)(false);
	const [pos, setPos] = (0, react.useState)(null);
	const bodyRef = (0, react.useRef)(null);
	const currentId = useSessions((state) => state.current);
	(0, react.useEffect)(() => {
		setCollapsed(false);
		setTextExpanded(false);
	}, [view.key]);
	(0, react.useEffect)(() => {
		const measure = () => {
			setPos(measurePos());
		};
		measure();
		const scrollport = document.querySelector("[data-conversation-scroll]");
		const observer = new ResizeObserver(measure);
		if (scrollport !== null) observer.observe(scrollport);
		window.addEventListener("resize", measure);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", measure);
		};
	}, [currentId]);
	const visible = view.text !== null && pos !== null;
	(0, react.useEffect)(() => {
		if (!visible) return;
		const el = bodyRef.current;
		if (el === null) return;
		const measure = () => {
			setOverflowing(el.scrollHeight > 121);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => {
			observer.disconnect();
		};
	}, [visible, view.text]);
	if (view.text === null || pos === null) return null;
	if (collapsed) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
		type: "button",
		style: {
			...styles.pill,
			top: pos.top,
			right: pos.right
		},
		onClick: () => {
			setCollapsed(false);
		},
		title: "展开用户请求",
		children: "你的要求"
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			...styles.float,
			top: pos.top,
			right: pos.right
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: styles.bodyWrap,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: bodyRef,
				style: {
					...styles.body,
					...overflowing && !textExpanded ? {
						maxHeight: 120,
						overflow: "hidden"
					} : {}
				},
				children: view.text
			}), overflowing && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				style: styles.clampToggle,
				"aria-expanded": textExpanded || void 0,
				onClick: () => {
					setTextExpanded((current) => !current);
				},
				children: textExpanded ? "收起" : "展开全文"
			})]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
			type: "button",
			style: styles.close,
			"aria-label": "收起",
			title: "收起",
			onClick: () => {
				setCollapsed(true);
			},
			children: "×"
		})]
	});
}
/** 所需服务：槽注册表 + 会话域 + 会话视图装配（chat 目标源）。 */
const inject = [
	"slots",
	"sessions",
	"uiConversation"
];
const AUTO_LOAD_THRESHOLD_PX = 400;
function apply(ctx) {
	const sessions = ctx.sessions;
	const uiConversation = ctx.uiConversation;
	const controller = new FloatController();
	const injected = () => ({ hooks: { floatView: controller.source } });
	let rebind;
	let retryTimer;
	ctx.effect(() => {
		const sync = () => {
			rebind?.();
			rebind = void 0;
			clearTimeout(retryTimer);
			retryTimer = void 0;
			const current = sessions.list.getSnapshot().current;
			if (current === void 0) {
				controller.clear();
				return;
			}
			const binding = sessions.binding(current);
			if (binding === void 0) {
				retryTimer = setTimeout(sync, 400);
				return;
			}
			const session = binding.session;
			const chatTarget = uiConversation === void 0 ? void 0 : uiConversation.binding(binding).target("chat");
			let disposed = false;
			let scrollport = null;
			let rafId = 0;
			let hasMore = false;
			let loadingOlder = false;
			let autoLoading = false;
			let lastPolledTop = null;
			const resize = new ResizeObserver(schedule);
			const mutation = new MutationObserver(schedule);
			const unsubscribe = session.subscribe(schedule);
			const unsubscribeChat = chatTarget === void 0 ? void 0 : chatTarget.subscribe(schedule);
			mutation.observe(document.body, {
				childList: true,
				subtree: true
			});
			const poll = setInterval(() => {
				if (disposed) return;
				const sp = scrollport ?? document.querySelector("[data-conversation-scroll]");
				if (sp === null) return;
				const top = sp.scrollTop;
				if (top === lastPolledTop && scrollport !== null) return;
				lastPolledTop = top;
				schedule();
			}, 400);
			function schedule() {
				if (disposed || rafId !== 0) return;
				let ran = false;
				const run = () => {
					if (ran || disposed) return;
					ran = true;
					clearTimeout(fallback);
					rafId = 0;
					compute();
				};
				const fallback = setTimeout(run, 150);
				rafId = requestAnimationFrame(run);
			}
			function compute() {
				if (disposed) return;
				if (scrollport === null) {
					scrollport = document.querySelector("[data-conversation-scroll]");
					if (scrollport !== null) {
						mutation.disconnect();
						mutation.observe(scrollport, {
							childList: true,
							subtree: true
						});
						scrollport.addEventListener("scroll", schedule, { passive: true });
						resize.observe(scrollport);
					}
				}
				if (scrollport === null) {
					controller.clear();
					return;
				}
				const snapshot = session.getSnapshot();
				hasMore = snapshot.hasMore === true;
				loadingOlder = snapshot.loadingOlder === true;
				const chat = chatTarget?.getSnapshot();
				if (dbg !== void 0) dbg.lastChat = chat;
				controller.update(scrollport, FloatController.foldChat(chat));
				maybeAutoLoadOlder();
			}
			function maybeAutoLoadOlder() {
				if (autoLoading || !hasMore || loadingOlder) return;
				if (scrollport === null || scrollport.scrollTop >= AUTO_LOAD_THRESHOLD_PX) return;
				autoLoading = true;
				const reset = () => {
					autoLoading = false;
					schedule();
				};
				Promise.resolve(session.loadOlder()).then(reset, reset);
			}
			compute();
			rebind = () => {
				disposed = true;
				clearInterval(poll);
				unsubscribe();
				unsubscribeChat?.();
				if (rafId !== 0) cancelAnimationFrame(rafId);
				resize.disconnect();
				mutation.disconnect();
				scrollport?.removeEventListener("scroll", schedule);
				controller.clear();
			};
		};
		const dispose = sessions.list.subscribe(sync);
		sync();
		return () => {
			dispose();
			clearTimeout(retryTimer);
			retryTimer = void 0;
			rebind?.();
			rebind = void 0;
		};
	}, "dsh-user-message-float: scroll binding");
	ctx.slots.inject("shell.overlay", () => ctx.slots.register({
		name: "shell.overlay",
		id: "user-message-float",
		order: 0,
		inject: injected
	}, UserMessageFloat));
}
//#endregion
exports.FloatController = FloatController;
exports.UserMessageFloat = UserMessageFloat;
exports.apply = apply;
exports.extractUserText = extractUserText;
exports.inject = inject;

return module.exports; } });
//# sourceMappingURL=client.js.map