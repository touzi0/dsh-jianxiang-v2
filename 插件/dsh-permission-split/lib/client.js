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
const FULL_ACCESS_PRESET = "danger-full-access";
const AUTO_REVIEW_PRESET = "auto";
const PRESET_LABEL_KEYS = new Map([
	["read-only", "preset.readOnly"],
	["workspace-write", "preset.workspaceWrite"],
	[FULL_ACCESS_PRESET, "preset.fullAccess"]
]);
const EN_PRESET_LABELS = {
	"preset.readOnly": "Read Only",
	"preset.workspaceWrite": "Workspace Write",
	"preset.fullAccess": "Full access"
};
const displayPresetName = (name) => {
	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name;
	return name.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
};
const displayPermissionPreset = (value, name, t) => {
	const key = PRESET_LABEL_KEYS.get(value);
	if (key !== void 0 && (name === value || name === EN_PRESET_LABELS[key])) return t(key);
	return displayPresetName(name);
};
const COPY = {
	zh: {
		mode: "访问模式，当前：{name}",
		presetsTitle: "权限模式",
		grantsTitle: "能力授权",
		"preset.readOnly": "仅可查看",
		"preset.workspaceWrite": "工作区内修改",
		"preset.fullAccess": "完全权限",
		"confirm.title": "确认启用完全权限？",
		"confirm.description": "启用完全权限后，智能体将减少确认步骤，并且可以直接执行更多操作，包括敏感操作、文件修改或外部命令。仅建议在你信任当前任务时使用。",
		"confirm.acknowledge": "我已了解风险，并愿意继续",
		"confirm.cancel": "取消",
		"confirm.enable": "启用完全权限",
		close: "关闭",
		"auto.label": "Auto review",
		"auto.badge": "实验",
		"auto.confirm.title": "确认启用 Auto review（实验）？",
		"auto.confirm.description": "Auto review 不使用沙箱。每次原生工具调用和 PTC 内层调用前，都会由与当前 agent 相同的模型进行审查。此功能仍属实验性，可能误放行或误拒绝，并会消耗额外 token。",
		"auto.confirm.acknowledge": "我已了解这些风险，并愿意继续",
		"auto.confirm.enable": "启用 Auto review",
		browser: "允许操作浏览器",
		computer: "允许操作电脑",
		shell: "允许沙箱外执行命令程序",
		browserHint: "勾选后模型调用浏览器工具不再询问",
		computerHint: "勾选后模型操作鼠标键盘与屏幕不再询问",
		shellHint: "勾选后允许在沙箱外运行命令程序",
		failed: "操作失败"
	},
	en: {
		mode: "Access mode, current: {name}",
		presetsTitle: "Mode",
		grantsTitle: "Capabilities",
		"preset.readOnly": "Read Only",
		"preset.workspaceWrite": "Workspace Write",
		"preset.fullAccess": "Full access",
		"confirm.title": "Enable Full access?",
		"confirm.description": "Full access reduces confirmation steps and lets the agent perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust the current task.",
		"confirm.acknowledge": "I understand the risks and want to continue",
		"confirm.cancel": "Cancel",
		"confirm.enable": "Enable Full access",
		close: "Close",
		"auto.label": "Auto review",
		"auto.badge": "Beta",
		"auto.confirm.title": "Enable Auto review (experimental)?",
		"auto.confirm.description": "Auto review runs without a sandbox. Before every native tool call and PTC inner call, the same model as the current agent reviews whether to allow it. This feature is experimental, can falsely allow or deny actions, and uses additional tokens.",
		"auto.confirm.acknowledge": "I understand these risks and want to continue",
		"auto.confirm.enable": "Enable Auto review",
		browser: "Operate the browser",
		computer: "Operate the computer",
		shell: "Run commands outside the sandbox",
		browserHint: "Stop asking when the model drives the browser",
		computerHint: "Stop asking when the model drives mouse, keyboard, or screen",
		shellHint: "Allow command programs to run outside the sandbox",
		failed: "Action failed"
	}
};
/**
* 样式：触发器逐条抄官方 `PermissionSelect.module.css`；弹层卡片与行抄
* 官方 `Menu.module.css`（`.list`/`.item`/`.label`）；仅右栏方框与两列
* 分栏为本模组自有。token 全部 `--dsw-*`。
*/
const STYLE = `
.jx-ps-anchor{position:relative;display:inline-flex}
/* 触发器：官方 PermissionSelect.module.css .trigger 原样 */
.jx-ps-trigger{display:inline-flex;align-items:center;gap:4px;min-width:0;max-width:220px;height:28px;padding:0 4px 0 8px;border:none;border-radius:24px;outline:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;font-weight:500;cursor:pointer}
.jx-ps-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.jx-ps-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}
.jx-ps-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.jx-ps-trigger-icon{display:inline-flex;flex:0 0 auto}
.jx-ps-trigger-icon svg{width:14px;height:14px}
.jx-ps-trigger-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jx-ps-chevron{display:inline-flex;flex:0 0 auto;color:var(--dsw-alias-label-caption);transition:transform 120ms ease}
.jx-ps-chevron-open{transform:rotate(180deg)}
@container (max-width:460px){.jx-ps-trigger:has(.jx-ps-trigger-icon) .jx-ps-trigger-label{display:none}}
/* 弹层卡片：官方 Menu.module.css .list 原样（改为向上弹出、两列平铺） */
.jx-ps-menu{box-sizing:border-box;position:absolute;bottom:calc(100% + 4px);left:0;z-index:100;display:flex;align-items:stretch;padding:4px;border:0;border-radius:20px;background:var(--dsw-specific-menu);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.jx-ps-col{display:flex;flex-direction:column;min-width:218px;max-width:300px}
.jx-ps-col+.jx-ps-col{margin-left:4px;padding-left:4px;border-left:0.5px solid var(--dsw-alias-border-l2)}
/* 分组标题：官方 Menu.module.css .label 原样 */
.jx-ps-head{padding:8px 10px;font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
/* 行：官方 Menu.module.css .item 原样 */
.jx-ps-row{display:flex;align-items:center;gap:8px;width:100%;min-height:40px;padding:8px 10px;border:none;border-radius:10px;background:transparent;cursor:pointer;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);text-align:left}
.jx-ps-row:hover:not(:disabled),.jx-ps-row:focus-visible:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);outline:none}
.jx-ps-row:disabled{opacity:.4;cursor:not-allowed}
.jx-ps-row-icon{display:inline-flex;flex:none;width:16px;height:16px;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary)}
.jx-ps-row-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jx-ps-check{flex:none;color:var(--dsw-alias-label-primary)}
.jx-ps-badge{flex:none;align-self:flex-start;margin-top:2px;color:var(--dsw-alias-label-tertiary);font-size:8px;line-height:10px;font-weight:600;letter-spacing:.2px}
/* 右栏能力行：官方 .item 几何原样，勾选方框放在行尾（与官方选中勾同位） */
.jx-ps-box{flex:none;width:14px;height:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:4px;background:transparent;position:relative}
.jx-ps-box-on{border-color:var(--dsw-alias-label-primary);background:var(--dsw-alias-label-primary)}
.jx-ps-box-on::after{content:'';position:absolute;left:2.5px;top:3.5px;width:7px;height:4px;border-left:1.5px solid var(--dsw-specific-menu);border-bottom:1.5px solid var(--dsw-specific-menu);transform:rotate(-45deg)}
.jx-ps-err{padding:6px 10px;font-size:12px;line-height:16px;color:var(--dsw-alias-state-error-primary)}
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
	/** 上一次发布给订阅者的快照；状态未变（浅比较）时不换引用、不通知。 */
	published;
	publish() {
		if (this.published !== void 0) {
			let same = true;
			for (const key of Object.keys(this.state)) if (this.state[key] !== this.published[key]) {
				same = false;
				break;
			}
			if (same) return;
		}
		this.published = this.state;
		for (const fn of [...this.listeners]) fn();
	}
	/**
	* 读取当前授权与预设目录。目录是进程级不变的，只读一次。
	* 控制器是全插件单例：换会话加载时先把授权表归零，避免上一个会话的
	* 勾选状态残留显示（拉取失败时尤其误导）。
	* @param sessionId - 目标会话。
	*/
	async load(sessionId) {
		try {
			this.state = {
				...this.state,
				grants: { ...NO_GRANTS }
			};
			this.publish();
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
			const catalog = await this.catalog.catalog();
			this.state = catalog.ok ? {
				...this.state,
				options: Array.isArray(catalog.value?.options) ? catalog.value.options : []
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
	* 展示一条非本地化错误（预设切换失败等），下一次成功操作时清除。
	* @param message - 错误信息。
	*/
	showError(message) {
		this.state = {
			...this.state,
			error: message
		};
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
const CHECK_PATH = "M12.1654 5.7552L8.9447 9.41475C8.73044 9.65816 8.53628 9.8804 8.35774 10.0423C8.1713 10.2114 7.94235 10.3717 7.64016 10.4254C7.48207 10.4535 7.32 10.4552 7.16151 10.4294C6.85843 10.3801 6.62728 10.2223 6.43836 10.0559C6.25752 9.89653 6.06037 9.67732 5.84264 9.43705L4.72925 8.20897L5.63557 7.38707L6.74897 8.61594C6.98603 8.87755 7.12974 9.03533 7.24673 9.13839C7.31033 9.19443 7.34485 9.21476 7.35823 9.22122C7.38068 9.22484 7.40352 9.22515 7.42593 9.22122C7.40522 9.22502 7.42893 9.23294 7.53583 9.136C7.65132 9.03126 7.79316 8.87139 8.02643 8.60638L11.2479 4.94763L12.1654 5.7552Z";
const permissionGlyphs = new Map([
	["read-only", /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		width: "16",
		height: "16",
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": true,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
			d: _deepseek_ai_dsh_client_ui_primitives.SHIELD_OUTLINE_PATH,
			stroke: "currentColor",
			strokeWidth: _deepseek_ai_dsh_client_ui_primitives.SHIELD_OUTLINE_STROKE,
			strokeLinejoin: "round"
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
			d: CHECK_PATH,
			fill: "currentColor"
		})]
	})],
	["workspace-write", /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		width: "16",
		height: "16",
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": true,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
				d: "M8.08887 0.251709C8.20479 0.23085 8.32486 0.241168 8.43652 0.282959L15.0215 2.75171C15.2787 2.84819 15.4492 3.09414 15.4492 3.3689V7.0105C15.4492 7.10986 15.4441 7.2081 15.4414 7.30542C15.0285 7.07175 14.5909 6.87695 14.1309 6.73022V3.82495L8.20508 1.60327L2.2793 3.82495V7.0105C2.27936 9.7171 3.4745 11.5379 5.02734 12.7947C5.01025 12.9942 5 13.1962 5 13.4001C5.00001 13.7617 5.02722 14.1169 5.08008 14.4636C2.91555 13.0393 0.961014 10.752 0.960938 7.0105V3.3689C0.960938 3.09417 1.13146 2.84821 1.38867 2.75171L7.97461 0.282959L8.08887 0.251709Z",
				fill: "currentColor"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
				d: "M11.3525 5.64688V6.85688H5V5.64688H11.3525Z",
				fill: "currentColor"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
				d: "M9.5824 8.29376V9.50376H5V8.29376H9.5824Z",
				fill: "currentColor"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
				d: "M14.6647 15.6852H10.0338C10.3865 15.3751 10.7561 15.0517 11.0772 14.7706C11.2539 14.6164 11.4148 14.4747 11.5517 14.3547H14.6647V15.6852Z",
				fill: "currentColor"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
				d: "M8.14852 14.1308L7.33498 15.4976C7.21984 15.6917 7.41809 15.9194 7.62601 15.8331L9.08648 15.2259L15.0284 10.0719L14.0789 8.97733L8.14852 14.1308Z",
				fill: "currentColor"
			})
		]
	})],
	[FULL_ACCESS_PRESET, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		width: "16",
		height: "16",
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": true,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
				d: _deepseek_ai_dsh_client_ui_primitives.SHIELD_OUTLINE_PATH,
				stroke: "currentColor",
				strokeWidth: _deepseek_ai_dsh_client_ui_primitives.SHIELD_OUTLINE_STROKE,
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
				d: "M9.10094 4.5V8.75939H7.59888V4.5H9.10094Z",
				fill: "currentColor"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
				d: "M9.10094 9.8114V11.5H7.59888V9.8114H9.10094Z",
				fill: "currentColor"
			})
		]
	})]
]);
/** 官方 PermissionSelect 同款：取预设图形；宿主自定义名无图形。 */
function permissionGlyph(value) {
	return permissionGlyphs.get(value);
}
function permissionLabel(value, name, t) {
	if (value === AUTO_REVIEW_PRESET) return t("auto.label");
	return displayPermissionPreset(value, name, t);
}
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
* 权限两列控件：左列官方预设单选（官方 PermissionSelect 外观与确认流），
* 右列三项能力多选。
* @param props - 注入面与框架 hooks 提供的 props。
* @returns 胶囊触发器与两列弹层。
*/
function PermissionSplit(props) {
	const { sessionId, locked, usePermissionSplit, useProjection, t } = props;
	const state = usePermissionSplit((snapshot) => snapshot);
	const selection = useProjection?.("permissions");
	const [open, setOpen] = (0, react.useState)(false);
	const [pick, setPick] = (0, react.useState)(null);
	const [confirmation, setConfirmation] = (0, react.useState)(null);
	const [acknowledged, setAcknowledged] = (0, react.useState)(false);
	const loadedFor = (0, react.useRef)(void 0);
	(0, react.useEffect)(() => {
		if (sessionId === void 0 || loadedFor.current === sessionId) return;
		loadedFor.current = sessionId;
		props.load();
	}, [sessionId, props.load]);
	(0, react.useEffect)(() => {
		if (!open) return void 0;
		const onKey = (event) => {
			if (event.key === "Escape") setOpen(false);
		};
		const onDown = (event) => {
			const target = event.target;
			if (target === null || target.closest(".jx-ps-anchor") === null) setOpen(false);
		};
		document.addEventListener("keydown", onKey);
		document.addEventListener("mousedown", onDown);
		return () => {
			document.removeEventListener("keydown", onKey);
			document.removeEventListener("mousedown", onDown);
		};
	}, [open]);
	if (sessionId === void 0) return null;
	const options = Array.isArray(state.options) ? state.options : [];
	const currentValue = pick !== null && options.some((option) => option.value === pick) ? pick : state.current ?? selection?.currentValue;
	const current = options.find((option) => option.value === currentValue);
	const currentLabel = current === void 0 ? permissionLabel(currentValue ?? "", currentValue ?? "", t) : permissionLabel(current.value, current.name, t);
	const busy = pick !== null || confirmation !== null || state.busy;
	/** 官方同款提交路径：提交 `/permission <preset>` 命令行；失败要可见。 */
	const submit = (id) => {
		setPick(id);
		props.selectPreset(id).catch((error) => {
			props.reportError(error instanceof Error ? error.message : String(error));
		}).then(() => {
			setPick(null);
		});
	};
	/** 官方同款选择流：危险预设先走风险确认弹窗。 */
	const choose = (id) => {
		setOpen(false);
		if (id === currentValue) return;
		if (id === FULL_ACCESS_PRESET || id === AUTO_REVIEW_PRESET) {
			setAcknowledged(false);
			setConfirmation(id);
			return;
		}
		submit(id);
	};
	const closeConfirmation = () => {
		setAcknowledged(false);
		setConfirmation(null);
	};
	const confirmSelection = (id) => {
		closeConfirmation();
		submit(id);
	};
	const confirmationTitle = confirmation === AUTO_REVIEW_PRESET ? t("auto.confirm.title") : t("confirm.title");
	const confirmationDescription = confirmation === AUTO_REVIEW_PRESET ? t("auto.confirm.description") : t("confirm.description");
	const confirmationAcknowledge = confirmation === AUTO_REVIEW_PRESET ? t("auto.confirm.acknowledge") : t("confirm.acknowledge");
	const confirmationEnable = confirmation === AUTO_REVIEW_PRESET ? t("auto.confirm.enable") : t("confirm.enable");
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
		className: "jx-ps-anchor",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			type: "button",
			className: "jx-ps-trigger",
			"aria-label": t("mode", { name: currentLabel }),
			title: current === void 0 ? void 0 : current.description,
			disabled: locked === true || busy,
			onClick: () => {
				setOpen((value) => !value);
			},
			children: [
				permissionGlyph(currentValue ?? "") !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "jx-ps-trigger-icon",
					"aria-hidden": true,
					children: permissionGlyph(currentValue ?? "")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "jx-ps-trigger-label",
					children: currentLabel
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: open ? "jx-ps-chevron jx-ps-chevron-open" : "jx-ps-chevron",
					"aria-hidden": true,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {})
				})
			]
		}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "jx-ps-menu",
			role: "dialog",
			"aria-label": t("presetsTitle"),
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "jx-ps-col",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "jx-ps-head",
						children: t("presetsTitle")
					}), options.map((option) => {
						const icon = permissionGlyph(option.value);
						const label = permissionLabel(option.value, option.name, t);
						const badge = option.value === AUTO_REVIEW_PRESET ? t("auto.badge") : void 0;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "jx-ps-row",
							disabled: busy,
							onClick: () => {
								choose(option.value);
							},
							children: [
								icon !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "jx-ps-row-icon",
									"aria-hidden": true,
									children: icon
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "jx-ps-row-label",
									children: label
								}),
								badge !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("sup", {
									className: "jx-ps-badge",
									children: badge
								}),
								option.value === currentValue && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "jx-ps-check",
									"aria-hidden": true,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
										width: "16",
										height: "16",
										viewBox: "0 0 16 16",
										fill: "none",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
											d: CHECK_PATH,
											fill: "currentColor"
										})
									})
								})
							]
						}, option.value);
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "jx-ps-col",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "jx-ps-head",
						children: t("grantsTitle")
					}), CAPABILITY_ROWS.map(([capability, nameKey]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						role: "checkbox",
						"aria-checked": state.grants[capability],
						className: "jx-ps-row",
						disabled: busy,
						onClick: () => {
							props.setGrant(capability, !state.grants[capability]);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "jx-ps-row-label",
							children: t(nameKey)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: state.grants[capability] ? "jx-ps-box jx-ps-box-on" : "jx-ps-box",
							"aria-hidden": true
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
	}), confirmation !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.RiskConfirmation, {
		open: true,
		title: confirmationTitle,
		description: confirmationDescription,
		acknowledgeLabel: confirmationAcknowledge,
		cancelLabel: t("confirm.cancel"),
		closeLabel: t("close"),
		confirmLabel: confirmationEnable,
		acknowledged,
		disabled: locked === true,
		onAcknowledgedChange: setAcknowledged,
		onCancel: closeConfirmation,
		onConfirm: () => {
			confirmSelection(confirmation);
		}
	})] });
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
			"remote.permissionPresets",
			"sessions",
			"locale"
		],
		apply(child) {
			const face = child;
			child.effect(() => face.locale.register("jxPermissionSplit", COPY), "dsh-permission-split: copy dictionaries");
			face.locale.bind("jxPermissionSplit");
			const controller = new PermissionSplitController(face.remote.jxPermission, face.remote.permissionPresets);
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
						if (live === void 0) throw new Error("session unavailable");
						const result = await live.command(`/permission ${preset}`);
						if (!result.ok) throw new Error(result.error.message);
						controller.setCurrent(preset);
					},
					setGrant: async (capability, granted) => {
						await controller.setGrant(sessionId, capability, granted);
					},
					reportError: (message) => {
						controller.showError(message);
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