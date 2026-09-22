import { setSandboxMode } from "@deepseek-ai/dsh-sandbox-policy";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region src/index.ts
/** 三项能力授权。 */
const CAPABILITIES = [
	"browser",
	"computer",
	"shell"
];
/** 全部能力的默认值：一律关闭（fail closed）。 */
const NO_GRANTS = Object.freeze({
	browser: false,
	computer: false,
	shell: false
});
/**
* 判定一份授权表里是否至少有一项被打开。
* @param grants - 待判定的授权表。
* @returns 是否有任一能力已授权。
*/
function anyGranted(grants) {
	return CAPABILITIES.some((capability) => grants[capability]);
}
/**
* 把任意输入规范成一份完整授权表：未知键丢弃、缺省键取 false。
* 输入来自会话日志（durable 边界）与 Remote 调用（wire 边界），故在此收敛校验。
* @param value - 待规范的原始值。
* @returns 完整且只含三项能力的授权表。
*/
function normalizeGrants(value) {
	const source = typeof value === "object" && value !== null ? value : {};
	return Object.fromEntries(CAPABILITIES.map((capability) => [capability, source[capability] === true]));
}
/** 会话授权网关：按会话读写三项能力授权。 */
var JxPermissionGateway = class extends TypertRemoteService {
	/** 类形式插件的注入声明（写法对照官方 PluginInventoryGateway）。 */
	static inject = ["agents"];
	/**
	* 同步授权表。授权判定发生在工具执行热路径上，必须是同步读；
	* 会话日志仍是权威记录，这里只是它的读缓存。
	*
	* 刻意用 TS-private 而不是 `#private`：Typert Gateway 直调经
	* `Reflect.get(receiver, method)` 派发，receiver 可能是服务的代理对象，
	* 运行时私有成员的品牌检查在代理上会抛
	* “Cannot read private member #grants from an object whose class did not declare it”。
	*/
	grants = /* @__PURE__ */ new Map();
	constructor(ctx) {
		super(ctx, "jxPermission");
		installApprovalBypass(ctx, this);
	}
	/**
	* 读取一个会话当前的授权表；从未授权或进程重启后返回全关。
	* @param sessionId - 目标会话/Agent 标识。
	* @returns 三项能力的当前授权。
	*/
	get(sessionId) {
		return this.grants.get(sessionId) ?? { ...NO_GRANTS };
	}
	/**
	* 改写一项能力授权：写会话事件（审计）并更新内存表。
	* 打开 `shell` 时同时把会话沙箱模式切到 `danger-full-access`——
	* 该授权只开「沙箱外运行进程」这一含义，文件权限轴由官方 Access 控件自行掌控。
	* @param sessionId - 目标会话/Agent 标识。
	* @param capability - 要改写的能力。
	* @param granted - 目标状态。
	* @returns 改写后的完整授权表。
	*/
	async set(sessionId, capability, granted) {
		if (!CAPABILITIES.includes(capability)) throw new Error(`dsh-permission-split: unknown capability ${JSON.stringify(capability)}`);
		const agent = this.agentOf(sessionId);
		const next = {
			...this.get(sessionId),
			[capability]: granted === true
		};
		this.grants.set(sessionId, next);
		agent?.session.append("jx/permission-split", { grants: next }, { ignorable: true });
		if (capability === "shell" && granted === true && agent !== void 0) setSandboxMode(agent.session, "danger-full-access");
		return next;
	}
	/**
	* 清空本会话的全部能力授权。
	* @param sessionId - 目标会话/Agent 标识。
	* @returns 清空后的授权表（全关）。
	*/
	async clear(sessionId) {
		const next = { ...NO_GRANTS };
		this.grants.set(sessionId, next);
		this.agentOf(sessionId)?.session.append("jx/permission-split", { grants: next }, { ignorable: true });
		return next;
	}
	/**
	* 供同进程的审批瀑布读取：某会话是否已授权某项能力。
	* @param sessionId - 目标会话/Agent 标识。
	* @param capability - 待查询的能力。
	* @returns 是否已授权。
	*/
	grantsCapability(sessionId, capability) {
		return this.get(sessionId)[capability];
	}
	/** 按会话标识取 Agent；服务未就绪或会话不在运行时返回 undefined。 */
	agentOf(sessionId) {
		const agents = this.ctx.agents;
		if (agents === void 0) return void 0;
		return agents.get(sessionId);
	}
};
/**
* 工具名片段 → 能力。
*
* 顺序即优先级：先匹配到的先算数。片段匹配（`includes`）而非精确名，
* 是为了容忍各 provider 的命名差异（`mcp__playwright-mcp__browser_click`
* 这类上游名与 `computer_use`、`cua_*` 这类本地名都能命中）。
*
* 刻意**不含** `tool-bash` / `tool-pwsh`：那条路径由官方审批与沙箱升级掌管，
* 并被其它策略依赖；`shell` 能力只表示「允许沙箱外执行」，不改动审批策略本身。
*/
const CAPABILITY_TOOL_PATTERNS = Object.freeze([["browser", Object.freeze([
	"browser_",
	"browser-",
	"playwright",
	"chrome-devtools",
	"puppeteer",
	"__browser"
])], ["computer", Object.freeze([
	"computer_",
	"computer-",
	"computeruse",
	"cua_",
	"cua-"
])]]);
/**
* 判定一个工具调用请求落在哪项能力下。
* @param toolName - 待判定的工具名。
* @returns 命中的能力；不落任何能力时返回 undefined（调用方应委托给下游）。
*/
function capabilityOfTool(toolName) {
	const name = toolName.toLowerCase();
	for (const [capability, patterns] of CAPABILITY_TOOL_PATTERNS) if (patterns.some((pattern) => name.includes(pattern))) return capability;
}
/**
* 在 `approval/request` 瀑布上认领已授权能力的请求。
*
* 这是「勾上就不再弹窗」的执行点：**返回 outcome 即认领**，官方与客户端的
* 应答者（弹窗）根本不会被问到；只有未命中或未授权时才 `next()` 交还瀑布。
* 未授时一律委托——默认关闭，fail closed。
*
* 作用域：请求带 `agent`，按 `agent.id` 取会话授权。
*
* @param ctx - 插件上下文。
* @param gateway - 授权网关，读取某会话是否已授权某能力。
* @returns 注销函数。
*/
function installApprovalBypass(ctx, gateway) {
	const handler = async (request, next) => {
		const capability = capabilityOfTool(request.toolName);
		if (capability === void 0) return next();
		const sessionId = request.agent?.id;
		if (typeof sessionId !== "string" || sessionId === "") return next();
		if (!gateway.grantsCapability(sessionId, capability)) return next();
		return "allowed-once";
	};
	return ctx.on("approval/request", handler);
}
Object.defineProperty(JxPermissionGateway.prototype, "@deepseek-ai/dsh-typert-protocol/remote-methods", {
	configurable: true,
	value: Object.freeze({
		version: 1,
		methods: Object.freeze([
			{
				method: "get",
				invocation: Object.freeze({ kind: "direct" })
			},
			{
				method: "set",
				invocation: Object.freeze({ kind: "direct" })
			},
			{
				method: "clear",
				invocation: Object.freeze({ kind: "direct" })
			}
		])
	})
});
//#endregion
export { CAPABILITIES, CAPABILITY_TOOL_PATTERNS, JxPermissionGateway, JxPermissionGateway as default, NO_GRANTS, anyGranted, capabilityOfTool, installApprovalBypass, normalizeGrants };
