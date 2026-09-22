window.__ModuleLoader__.load({ id: "dsh-permission-split", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
let react = require("react");
let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
let react_jsx_runtime = require("react/jsx-runtime");
//#region src/client.tsx
const lightSchema = (typeSymbol, kind) => ({
	kind,
	typeSymbol,
	parse(value) {
		if (kind === "booleanRecord") return value;
		return value;
	}
});
const jsonCodec = (typeSymbol, kind) => ({
	mode: "strict",
	typeSymbol,
	create: () => lightSchema(typeSymbol, kind)
});
const TYPERT_REMOTE = {
	package: "dsh-permission-split",
	descriptors: [{
		id: "dsh-permission-split#jxPermission/get",
		service: "jxPermission",
		namespace: "jxPermission",
		method: "get",
		invocation: { kind: "direct" },
		parameters: [{
			name: "sessionId",
			wire: "sessionId",
			source: "json",
			codec: jsonCodec("dsh-permission-split#jxPermission/get:sessionId", "string")
		}],
		result: jsonCodec("dsh-permission-split#jxPermission/get:result", "booleanRecord"),
		sourceLocation: {
			file: "src/index.ts",
			line: 1,
			column: 3
		}
	}, {
		id: "dsh-permission-split#jxPermission/set",
		service: "jxPermission",
		namespace: "jxPermission",
		method: "set",
		invocation: { kind: "direct" },
		parameters: [
			{
				name: "sessionId",
				wire: "sessionId",
				source: "json",
				codec: jsonCodec("dsh-permission-split#jxPermission/set:sessionId", "string")
			},
			{
				name: "capability",
				wire: "capability",
				source: "json",
				codec: jsonCodec("dsh-permission-split#jxPermission/set:capability", "string")
			},
			{
				name: "granted",
				wire: "granted",
				source: "json",
				codec: jsonCodec("dsh-permission-split#jxPermission/set:granted", "boolean")
			}
		],
		result: jsonCodec("dsh-permission-split#jxPermission/set:result", "booleanRecord"),
		sourceLocation: {
			file: "src/index.ts",
			line: 1,
			column: 3
		}
	}]
};
const COPY = {
	zh: {
		title: "权限",
		aria: "权限，当前 {name}",
		presetsTitle: "权限模式",
		grantsTitle: "能力授权",
		browser: "允许操作浏览器",
		computer: "允许操作电脑",
		shell: "允许沙箱外执行命令程序",
		browserHint: "勾选后模型调用浏览器工具不再询问",
		computerHint: "勾选后模型操作鼠标键盘与屏幕不再询问",
		shellHint: "勾选后允许在沙箱外运行命令程序",
		failed: "操作失败"
	},
	en: {
		title: "Permissions",
		aria: "Permissions, currently {name}",
		presetsTitle: "Mode",
		grantsTitle: "Capabilities",
		browser: "Operate the browser",
		computer: "Operate the computer",
		shell: "Run commands outside the sandbox",
		browserHint: "Stop asking when the model drives the browser",
		computerHint: "Stop asking when the model drives mouse, keyboard, or screen",
		shellHint: "Allow command programs to run outside the sandbox",
		failed: "Action failed"
	}
};
/** 胶囊与两列弹层样式：token 全部取官方 `--dsw-*`；trigger 照搬官方 PermissionSelect。 */
const STYLE = `
.jx-ps-anchor{position:relative;display:inline-flex}
.jx-ps-trigger{display:inline-flex;align-items:center;gap:4px;max-width:100%;min-height:28px;padding:0 8px;border:none;border-radius:16px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;font-weight:500;white-space:nowrap;cursor:pointer}
.jx-ps-trigger:not(:disabled):hover,.jx-ps-trigger[aria-expanded='true']{background:var(--dsw-alias-interactive-bg-hover)}
.jx-ps-trigger:disabled{cursor:default;color:var(--dsw-alias-label-quaternary)}
.jx-ps-trigger-icon{flex:none;display:inline-flex;color:var(--dsw-alias-label-primary)}
.jx-ps-chevron{flex:none;color:var(--dsw-alias-label-caption);transition:transform 120ms ease}
.jx-ps-chevron-open{transform:rotate(180deg)}
.jx-ps-panel{position:absolute;bottom:calc(100% + 6px);left:0;z-index:40;display:flex;align-items:flex-start;padding:4px;border:1px solid var(--dsw-alias-border-secondary);border-radius:12px;background:var(--dsw-alias-bg-elevated);box-shadow:0 8px 24px rgba(0,0,0,.12)}
.jx-ps-col{display:flex;flex-direction:column;gap:2px;padding:4px;min-width:200px;max-width:280px}
.jx-ps-col + .jx-ps-col{border-left:1px solid var(--dsw-alias-border-secondary)}
.jx-ps-head{padding:4px 8px 6px;font-size:12px;line-height:16px;color:var(--dsw-alias-label-caption)}
.jx-ps-row{display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border:none;border-radius:8px;background:transparent;text-align:left;cursor:pointer}
.jx-ps-row:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover)}
.jx-ps-row:disabled{cursor:default;opacity:.5}
.jx-ps-row-mark{flex:none;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;margin-top:2px;color:var(--dsw-alias-label-primary)}
.jx-ps-box{flex:none;width:14px;height:14px;margin-top:3px;border:1.5px solid var(--dsw-alias-border-secondary);border-radius:3px;background:transparent}
.jx-ps-box-on{border-color:var(--dsw-alias-label-primary);background:var(--dsw-alias-label-primary)}
.jx-ps-box-on::after{content:'';display:block;width:7px;height:3px;margin:2px 0 0 3px;border-left:1.5px solid var(--dsw-alias-bg-elevated);border-bottom:1.5px solid var(--dsw-alias-bg-elevated);transform:rotate(-45deg)}
.jx-ps-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.jx-ps-name{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.jx-ps-desc{font-size:12px;line-height:16px;color:var(--dsw-alias-label-caption);white-space:normal}
.jx-ps-err{padding:4px 8px;font-size:12px;line-height:16px;color:var(--dsw-alias-label-error)}
`;
const NO_GRANTS = {
	browser: false,
	computer: false,
	shell: false
};
var PermissionSplitController = class {
	jxPermission;
	catalog;
	state = {
		grants: { ...NO_GRANTS },
		options: [],
		current: void 0,
		busy: false,
		error: null
	};
	listeners = /* @__PURE__ */ new Set();
	loaded = false;
	constructor(jxPermission, catalog) {
		this.jxPermission = jxPermission;
		this.catalog = catalog;
	}
	source = {
		getSnapshot: () => this.state,
		subscribe: (fn) => {
			this.listeners.add(fn);
			return () => {
				this.listeners.delete(fn);
			};
		}
	};
	publish() {
		this.state = { ...this.state };
		for (const fn of [...this.listeners]) fn();
	}
	/**
	* 读取当前授权与预设目录。目录是进程级不变的，只读一次。
	* @param sessionId - 目标会话。
	*/
	async load(sessionId) {
		try {
			const grants = await this.jxPermission.get(sessionId);
			this.state = grants.ok ? {
				...this.state,
				grants: grants.value,
				error: null
			} : {
				...this.state,
				error: grants.error.message
			};
			this.publish();
			if (this.loaded) return;
			this.loaded = true;
			const catalog = await this.catalog.list();
			this.state = catalog.ok ? {
				...this.state,
				options: catalog.value.options
			} : {
				...this.state,
				error: catalog.error.message
			};
			this.publish();
		} catch (error) {
			this.state = {
				...this.state,
				error: error instanceof Error ? error.message : String(error)
			};
			this.publish();
		}
	}
	/**
	* 改写一项能力授权。乐观置位，失败回滚。
	* @param sessionId - 目标会话。
	* @param capability - 能力。
	* @param granted - 目标状态。
	*/
	async setGrant(sessionId, capability, granted) {
		if (this.state.busy) return;
		const previous = this.state.grants;
		this.state = {
			...this.state,
			grants: {
				...previous,
				[capability]: granted
			},
			busy: true,
			error: null
		};
		this.publish();
		try {
			const result = await this.jxPermission.set(sessionId, capability, granted);
			this.state = {
				...this.state,
				busy: false,
				grants: result.ok ? result.value : previous,
				error: result.ok ? null : result.error.message
			};
		} catch (error) {
			this.state = {
				...this.state,
				busy: false,
				grants: previous,
				error: error instanceof Error ? error.message : String(error)
			};
		}
		this.publish();
	}
	/**
	* 记录当前预设（由会话投影给出）。
	* @param current - 当前预设值。
	*/
	setCurrent(current) {
		if (this.state.current === current) return;
		this.state = {
			...this.state,
			current
		};
		this.publish();
	}
};
const CAPABILITY_ROWS = [
	[
		"browser",
		"browser",
		"browserHint"
	],
	[
		"computer",
		"computer",
		"computerHint"
	],
	[
		"shell",
		"shell",
		"shellHint"
	]
];
/**
* 权限两列控件：左列官方预设单选，右列三项能力多选。
* @param props - 注入面与框架 hooks 提供的 props。
* @returns 胶囊触发器与两列弹层。
*/
function PermissionSplit(props) {
	const { sessionId, usePermissionSplit, t } = props;
	const state = usePermissionSplit((snapshot) => snapshot);
	const [open, setOpen] = (0, react.useState)(false);
	(0, react.useEffect)(() => {
		props.load();
	}, [props.load]);
	(0, react.useEffect)(() => {
		if (!open) return void 0;
		const onKey = (event) => {
			if (event.key === "Escape") setOpen(false);
		};
		const onDown = (event) => {
			if (event.target?.closest(".jx-ps-anchor") === null) setOpen(false);
		};
		document.addEventListener("keydown", onKey);
		document.addEventListener("mousedown", onDown);
		return () => {
			document.removeEventListener("keydown", onKey);
			document.removeEventListener("mousedown", onDown);
		};
	}, [open]);
	if (sessionId === void 0) return null;
	const currentName = state.options.find((option) => option.value === state.current)?.name ?? state.current ?? t("title");
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
		className: "jx-ps-anchor",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			type: "button",
			className: "jx-ps-trigger",
			"aria-label": t("aria", { name: currentName }),
			"aria-haspopup": "dialog",
			"aria-expanded": open,
			disabled: state.busy,
			onClick: () => {
				setOpen((value) => !value);
			},
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "jx-ps-trigger-icon",
					"aria-hidden": true,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
						width: "16",
						height: "16",
						viewBox: "0 0 16 16",
						fill: "none",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
							d: _deepseek_ai_dsh_client_ui_primitives.SHIELD_OUTLINE_PATH,
							stroke: "currentColor",
							strokeWidth: _deepseek_ai_dsh_client_ui_primitives.SHIELD_OUTLINE_STROKE,
							strokeLinejoin: "round"
						})
					})
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: currentName }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: open ? "jx-ps-chevron jx-ps-chevron-open" : "jx-ps-chevron" })
			]
		}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "jx-ps-panel",
			role: "dialog",
			"aria-label": t("title"),
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "jx-ps-col",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "jx-ps-head",
						children: t("presetsTitle")
					}), state.options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "jx-ps-row",
						disabled: state.busy,
						onClick: () => {
							props.selectPreset(option.value);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "jx-ps-row-mark",
							"aria-hidden": true,
							children: option.value === state.current && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
								width: "16",
								height: "16",
								viewBox: "0 0 16 16",
								fill: "none",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
									d: "M12.1654 5.7552L8.9447 9.41475C8.73044 9.65816 8.53628 9.8804 8.35774 10.0423C8.1713 10.2114 7.94235 10.3717 7.64016 10.4254C7.48207 10.4535 7.32 10.4552 7.16151 10.4294C6.85843 10.3801 6.62728 10.2223 6.43836 10.0559C6.25752 9.89653 6.06037 9.67732 5.84264 9.43705L4.72925 8.20897L5.63557 7.38707L6.74897 8.61594C6.98603 8.87755 7.12974 9.03533 7.24673 9.13839C7.31033 9.19443 7.34485 9.21476 7.35823 9.22122C7.38068 9.22484 7.40352 9.22515 7.42593 9.22122C7.40522 9.22502 7.42893 9.23294 7.53583 9.136C7.65132 9.03126 7.79316 8.87139 8.02643 8.60638L11.2479 4.94763L12.1654 5.7552Z",
									fill: "currentColor"
								})
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "jx-ps-text",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "jx-ps-name",
								children: option.name
							}), option.description !== void 0 && option.description !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "jx-ps-desc",
								children: option.description
							})]
						})]
					}, option.value))]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "jx-ps-col",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "jx-ps-head",
						children: t("grantsTitle")
					}), CAPABILITY_ROWS.map(([capability, nameKey, hintKey]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						role: "checkbox",
						"aria-checked": state.grants[capability],
						className: "jx-ps-row",
						disabled: state.busy,
						onClick: () => {
							props.setGrant(capability, !state.grants[capability]);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: state.grants[capability] ? "jx-ps-box jx-ps-box-on" : "jx-ps-box",
							"aria-hidden": true
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "jx-ps-text",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "jx-ps-name",
								children: t(nameKey)
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "jx-ps-desc",
								children: t(hintKey)
							})]
						})]
					}, capability))]
				}),
				state.error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "jx-ps-err",
					children: [
						t("failed"),
						": ",
						state.error
					]
				})
			]
		})]
	});
}
const inject = ["remote"];
async function apply(ctx) {
	const disposeStyle = ctx.effect(() => {
		const style = document.createElement("style");
		style.dataset.jxPermissionSplit = "panel";
		style.textContent = STYLE;
		document.head.append(style);
		return () => {
			style.remove();
		};
	}, "dsh-permission-split: two-column panel styles");
	const disposeMount = await ctx.remote.$mount(TYPERT_REMOTE);
	const disposeSlot = ctx.plugin({
		name: "dsh-permission-split/panel",
		inject: [
			"slots",
			"remote.jxPermission",
			"remote.agentPresets",
			"sessions",
			"locale"
		],
		apply(child) {
			const face = child;
			child.effect(() => face.locale.register("jxPermissionSplit", COPY), "dsh-permission-split: copy dictionaries");
			face.locale.bind("jxPermissionSplit");
			const controller = new PermissionSplitController(face.remote.jxPermission, face.remote.agentPresets);
			child.slots.inject("conversation.input.permission", () => child.slots.register({
				name: "conversation.input.permission",
				locale: "jxPermissionSplit",
				inject: (sessionId) => ({
					hooks: { permissionSplit: controller.source },
					load: async () => {
						await controller.load(sessionId);
					},
					selectPreset: async (preset) => {
						const live = face.sessions.binding(sessionId)?.session;
						if (live === void 0) return;
						const result = await live.command(`/permission ${preset}`);
						if (!result.ok) throw new Error(`${COPY.zh.failed}: ${result.error.message}`);
						controller.setCurrent(preset);
					},
					setGrant: async (capability, granted) => {
						await controller.setGrant(sessionId, capability, granted);
					}
				})
			}, PermissionSplit));
		}
	});
	return async () => {
		await disposeSlot();
		await disposeMount();
		await disposeStyle();
	};
}
//#endregion
exports.PermissionSplit = PermissionSplit;
exports.apply = apply;
exports.inject = inject;

return module.exports; } });