import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region src/summary.ts
/** 会改文件的工具名（按官方工具目录）。 */
const WRITE_TOOLS = new Set([
	"write",
	"edit",
	"str_replace_editor"
]);
const DEFAULTS = {
	middleTextLimit: 3,
	snippetChars: 220,
	finalChars: 900,
	maxFiles: 30
};
/** 压缩空白并按上限截断，超限加省略号。 */
function clip(text, limit) {
	const flat = text.replace(/\s+/g, " ").trim();
	if (flat.length <= limit) return flat;
	return `${flat.slice(0, limit - 1)}…`;
}
function asRecord(value) {
	return typeof value === "object" && value !== null ? value : void 0;
}
/** 从工具参数 JSON 串里取文件路径（只认 file_path / path）。 */
function pathFromArguments(raw) {
	if (typeof raw !== "string" || raw.trim() === "") return void 0;
	try {
		const parsed = asRecord(JSON.parse(raw));
		if (parsed === void 0) return void 0;
		for (const key of ["file_path", "path"]) {
			const value = parsed[key];
			if (typeof value === "string" && value.trim() !== "") return value;
		}
		return;
	} catch {
		return;
	}
}
/** 该 step 的压缩流里是否含非空思考。 */
function streamHasReasoning(stream) {
	const records = Array.isArray(stream) ? stream : asRecord(stream)?.records;
	if (!Array.isArray(records)) return false;
	return records.some((record) => {
		const entry = asRecord(record);
		if (entry === void 0 || entry.type !== "reasoning-chunks") return false;
		const chunks = entry.chunks;
		return Array.isArray(chunks) && chunks.length > 0;
	});
}
/** 一轮的结束原因。 */
function reasonOf(data) {
	const reason = data.reason;
	if (typeof reason === "string") return reason;
	const kind = asRecord(reason)?.kind;
	return typeof kind === "string" ? kind : "completed";
}
/** 工具结果是否失败（工具结果消息自带 isError，失败还会有 error 字段）。 */
function resultFailed(data, message) {
	if (data.error !== void 0) return true;
	if (message?.isError === true) return true;
	const content = message?.content;
	if (Array.isArray(content)) return content.some((block) => asRecord(block)?.isError === true);
	return false;
}
/** 折叠一个会话的全部事件，得到「做了什么」的压缩摘要。 */
function summarizeSession(events, options = {}) {
	const config = {
		...DEFAULTS,
		...options
	};
	let turns = 0;
	let steps = 0;
	let reasoningSteps = 0;
	let startedAt;
	let endedAt;
	let stopReason = "completed";
	const snippets = [];
	const toolCounts = /* @__PURE__ */ new Map();
	const toolOrder = [];
	/** callId → 该次调用的工具名与目标路径。 */
	const calls = /* @__PURE__ */ new Map();
	const files = /* @__PURE__ */ new Map();
	for (const event of events) {
		const data = asRecord(event.data) ?? {};
		switch (event.type) {
			case "turn/start":
				if (startedAt === void 0 && typeof event.time === "number") startedAt = event.time;
				break;
			case "turn/end":
				turns += 1;
				if (typeof event.time === "number") endedAt = event.time;
				stopReason = reasonOf(data);
				break;
			case "step/end":
				steps += 1;
				break;
			case "assistant/message": {
				const content = asRecord(data.message)?.content;
				if (!Array.isArray(content)) break;
				const own = [];
				let hasReasoning = false;
				for (const rawBlock of content) {
					const block = asRecord(rawBlock);
					if (block === void 0) continue;
					if (block.type === "reasoning" && typeof block.text === "string" && block.text.trim() !== "") hasReasoning = true;
					if (block.type === "text" && typeof block.text === "string" && block.text.trim() !== "") own.push(block.text);
				}
				if (hasReasoning) reasoningSteps += 1;
				if (own.length > 0) snippets.push(own.join("\n\n"));
				break;
			}
			case "assistant/attempt":
				if (streamHasReasoning(data.stream)) reasoningSteps += 1;
				break;
			case "tool/call": {
				const name = typeof data.name === "string" ? data.name : "unknown";
				toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
				if (!toolOrder.includes(name)) toolOrder.push(name);
				const callId = data.callId;
				if (typeof callId === "string") calls.set(callId, {
					name,
					path: pathFromArguments(data.arguments)
				});
				break;
			}
			case "tool/result": {
				const message = asRecord(data.message);
				const callId = asRecord(message?.source)?.callId;
				const call = typeof callId === "string" ? calls.get(callId) : void 0;
				if (call === void 0 || call.path === void 0) break;
				if (!WRITE_TOOLS.has(call.name)) break;
				if (resultFailed(data, message)) break;
				const operation = asRecord(data.meta)?.operation;
				const op = operation === "create" ? "create" : operation === "update" ? "update" : "unknown";
				const previous = files.get(call.path);
				if (previous === void 0 || previous === "unknown") files.set(call.path, op);
				break;
			}
			default: break;
		}
	}
	const finalRaw = snippets.length > 0 ? snippets[snippets.length - 1] : "";
	const middleTexts = snippets.slice(0, Math.max(0, snippets.length - 1)).slice(-config.middleTextLimit).map((text) => clip(text, config.snippetChars));
	return {
		turns,
		steps,
		reasoningSteps,
		toolCalls: toolOrder.map((name) => ({
			name,
			count: toolCounts.get(name) ?? 0
		})),
		middleTexts,
		finalText: clip(finalRaw, config.finalChars),
		changedFiles: [...files.entries()].slice(0, config.maxFiles).map(([path, op]) => ({
			path,
			op
		})),
		stopReason,
		...startedAt === void 0 ? {} : { startedAt },
		...endedAt === void 0 ? {} : { endedAt }
	};
}
/** 结束原因的中文说法。 */
function stopReasonText(reason) {
	switch (reason) {
		case "completed": return "正常完成";
		case "aborted": return "被中断";
		case "interrupted": return "异常中断（可能是宿主重启/崩溃）";
		case "blocked": return "被策略拦下";
		case "max-tokens": return "触达输出上限";
		case "error": return "出错结束";
		default: return reason;
	}
}
/** 文件改动的中文说法。 */
function opText(op) {
	switch (op) {
		case "create": return "新增";
		case "update": return "修改";
		default: return "改动";
	}
}
/** 用时的人类可读写法。 */
function durationText(summary) {
	if (summary.startedAt === void 0 || summary.endedAt === void 0) return "";
	const seconds = Math.max(0, Math.round((summary.endedAt - summary.startedAt) / 1e3));
	if (seconds < 60) return `，用时 ${seconds} 秒`;
	return `，用时 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}
/**
* 把摘要渲染成给数字助理看的文本。这是数字助理了解「别的对话做了什么」的唯一入口，
* 所以刻意不含思考内容、不含工具参数、不含文件内容。
* @param summary - 折叠结果。
* @param meta - 会话标识与标题。
* @returns 一段中文 Markdown。
*/
function renderSummaryText(summary, meta) {
	const lines = [];
	const title = meta.title === void 0 || meta.title.trim() === "" ? "（无标题）" : meta.title;
	lines.push(`【会话 ${meta.sessionId}】${title} —— ${stopReasonText(summary.stopReason)}${durationText(summary)}`);
	if (meta.workspaceTitle !== void 0) lines.push(`· 工作区：${meta.workspaceTitle}`);
	if (meta.task !== void 0) lines.push(`· 派给它的需求：${clip(meta.task, 200)}`);
	lines.push(`· 规模：${summary.turns} 轮 / ${summary.steps} 步（其中 ${summary.reasoningSteps} 步带思考）`);
	if (summary.toolCalls.length === 0) lines.push("· 工具调用：无");
	else lines.push(`· 工具调用：${summary.toolCalls.map((tool) => `${tool.name}×${tool.count}`).join("、")}`);
	if (summary.middleTexts.length === 0) lines.push("· 中间正文：无");
	else {
		lines.push("· 中间正文：");
		for (const text of summary.middleTexts) lines.push(`  - ${text}`);
	}
	lines.push(`· 最终答复：${summary.finalText === "" ? "（没有正文输出）" : summary.finalText}`);
	if (summary.changedFiles.length === 0) lines.push("· 改动文件：无（未记录到成功的写文件动作）");
	else lines.push(`· 改动文件：${summary.changedFiles.map((file) => `${file.path}（${opText(file.op)}）`).join("、")}`);
	lines.push("（以上是压缩摘要，不含思考内容与工具参数细节；需要更多细节时读会话或让用户点进该会话查看。）");
	return lines.join("\n");
}
//#endregion
//#region src/index.ts
/**
* 数字助理 —— 宿主半边。
*
* 一个常驻的唯一会话（固定 sessionId），它有两样专属东西：
*   1. 专属系统提示词（`systemPrompt.section` 注册在该 agent 作用域）；
*   2. 专属工具（`agentCtx.tools.register` 注册在该 agent 作用域），
*      并用 `tools.restrict({ allow: [...] })` 把全局工具收窄到只剩提问工具。
* 它把需求派给「别的普通顶层会话」：照官方 webhook 范式
* （`agents.create` + `workspace.attachSession` + `permissionPresets.set` + `followup`）
* 建会话、投递需求，并在子会话跑完（`session/event` 的 `turn/end`）后
* 自己折叠出一份压缩摘要回送给自己。
*/
const name = "dsh-digital-assistant";
/** 数字助理会话的固定身份：常驻唯一，重启后按同一 id 恢复。 */
const ASSISTANT_SESSION_ID = "session-jx-assistant";
/** 数字助理落脚目录登记成的工作区标题。 */
const ASSISTANT_WORKSPACE_TITLE = "数字助理";
/** 数字助理自己的提示词段（scoped，只在它的会话里出现）。 */
const PERSONA_SECTION = "jx-digital-assistant/persona";
/** 段序：排在部署 persona 前缀（0）之后、后缀（10200）之前。 */
const PERSONA_ORDER = 5e3;
/** 子会话默认模式。 */
const DEFAULT_PRESET = "standard";
/** 默认权限：工作区内修改。 */
const DEFAULT_PERMISSION = "workspace-write";
/** 完全访问权限的取值。 */
const FULL_ACCESS_PERMISSION = "danger-full-access";
/** `list_sessions` 的默认与上限条数。 */
const SESSIONS_DEFAULT_LIMIT = 12;
const SESSIONS_MAX_LIMIT = 40;
const REPO_ROOT = resolve(resolve(resolve(dirname(fileURLToPath(import.meta.url)), ".."), ".."), "..");
/** 数字助理会话的工作目录（独立目录，不碰用户的业务目录）。 */
const ASSISTANT_CWD = join(process.env.DSH_HOME ?? join(REPO_ROOT, "dsh-home"), "assistant");
/**
* 数字助理的系统提示词。写法面向模型：先说身份与边界，再说分派规则与汇报要求；
* 不出现 UI/传输/实现词汇（工具名除外）。
*/
const ASSISTANT_PROMPT = `你是「坚祥数字助理」。这个软件是坚祥数字助理，构建在 DSH（DeepSeek Harness）之上；
用户说到「这个软件」「这个助手」「DSH」时，指的就是你现在运行的这个产品（坚祥数字助理 / DeepSeek Harness）。

## 你是谁

你是用户唯一的总入口。用户只对你提需求，由你决定这件事该交给哪个对话去做。
你在界面上只出现在侧边栏左上角的「数字助理」入口：不占工作区里的会话列表，
用户点那个入口就是回到这里。你自己不动手：不读文件、不写文件、不执行命令、不搜网页。
你的全部工作就是「看清需求 → 选对工作区 → 新建或复用对话 → 把需求交代清楚 →
等它做完 → 用摘要向用户汇报」。

## 你手上的工具

- list_workspaces：看用户已经建过哪些工作区。
- list_sessions：看最近的对话（标题、所属工作区、时间、是否还在跑）。
- list_presets：看这台机器上可用的模式（preset）有哪些。
- list_models：看有哪些模型提供方与模型可选。
- read_session_summary：看某个对话做过什么的压缩摘要。
- dispatch_task：在指定工作区**新建**一个对话，并把需求交给它做（后台跑）。
- send_to_session：把新需求追加给**已有**对话。
- create_workspace：新建工作区（只在用户点头之后用；见下）。
- todo_task_list / todo_task_get：查看用户的待办事项与定时任务（含 id、执行方式、下次执行时间、上次结果）。
- todo_task_create / todo_task_update / todo_task_delete：增、改、删待办与定时任务。三种执行方式：不定时（manual）、
  定时一次（once + at）、循环（daily/weekly/weekdays + time，或 interval + every_minutes）；AI 任务（assistant，默认，
  到点转给你执行）与程序任务（command + 命令 + workspace_id，到点直接运行）都支持。删除会先请用户审批。
- todo_task_run：立即执行一条待办/定时任务（执行前请用户审批）。
- todo_workspace_list：列出可选工作区（程序任务选工作目录用）。

用户说「记个待办」「加到任务清单」「定时/每天/工作日几点提醒我做某事」时，直接用 todo_task_create 建，
不用另开对话；AI 任务的描述要写成自足的一段（到点会原样发给你，由你安排执行）。

## 模式与模型

派活之前用 list_presets / list_models 看一眼可选项，再决定：
- 模式：常规的编码、文件处理、查资料都该用 standard；只在任务确实适合时才换别的模式。
- 模型：用户没点名、你也拿不准时，**不要传 provider/model**，让新对话沿用用户当前的默认模型，这是最稳的选择。
- 只有用户明确指定了某个模型，或任务明显需要某个模型时，才写进 dispatch_task。

## 怎么选目标

1. **先看已有工作区**。优先复用用户已经建过的工作区；不要因为省事就在别处开工。
   我自己的落脚目录不在 list_workspaces 里——那是我的家，不是干活的地方，别往里派活。
2. **没有合适的工作区就提建议并问用户**：给出你建议的目录路径与理由，用 ask_user_question 让用户确认；
   用户同意后才 create_workspace，然后才 dispatch_task。用户不同意就换一个建议，或问他想放哪里。
3. **判断相关性**：先回顾你自己最近十几轮里给用户办过什么、派过哪些活，再对照 list_sessions 里最近的对话
   （必要时用 read_session_summary 看它的轮数与做过什么）。然后照这个规则选：
   - 相关、这件事不复杂、那个对话也还不算长 → 用 send_to_session 复用那个对话（上下文是连续的，效率最高）。
   - 不相关、或者这件事本身复杂、或者那个对话已经很长（轮数多、话题跑偏）→ 用 dispatch_task 新建对话。
   - 拿不准就问用户一句，别自己硬猜。

## 怎么交代需求

写进 dispatch_task / send_to_session 的 task，必须是**一段自足的话**：目标、验收标准、涉及的目录或文件、
以及你知道的相关背景。别写「照上面说的做」这类指代——对面那个对话看不到我们的聊天记录。
目的地工作区要交代清楚，让它在正确的目录里开工。

## 权限

- 默认用 workspace-write（工作区内修改），这是绝大多数情况的正解。
- 只有确实需要动工作区之外的东西（装全局依赖、改系统目录、访问别的盘）时，才考虑 danger-full-access。
- **要用完全访问，必须先问用户**：先用 ask_user_question 把「为什么需要」「要动哪里」讲清楚，让用户选。
  用户明确同意后，调用 dispatch_task 时带上 permission="danger-full-access" 且 user_confirmed=true。
  用户没同意就退回 workspace-write。这一条没有例外。

## 汇报

dispatch_task 是**后台**的：它立刻返回一个会话 id，活在那里跑。
那个对话跑完时，你会自动收到一条消息，里面是它的压缩摘要（做了几轮几步、调用了哪些工具、
中间说了什么、最后的答复、改了哪些文件）——不含它的思考内容和工具参数细节。
收到摘要后，用**用户听得懂的话**汇报：做成了什么、结果在哪、有没有留下没做完的事。
用户想细看，就提示他点侧边栏里那个对话；需要更多细节时你可以 read_session_summary。

一次可以派多个互不相干的需求（并行）。同一件事别重复派。`;
/** 路径比较：Windows 下大小写不敏感，且忽略末尾分隔符。 */
function samePath(left, right) {
	const normalize = (value) => value.replace(/[\\/]+$/u, "").replace(/\//gu, "\\").toLowerCase();
	return normalize(left) === normalize(right);
}
/** epoch 毫秒 → 本地「MM-DD HH:mm」。 */
function formatTime(value) {
	if (value === void 0 || !Number.isFinite(value)) return "未知时间";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "未知时间";
	const pad = (part) => String(part).padStart(2, "0");
	return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
/** 内容块 helper：工具输出一律是纯文本块。 */
function textBlock(text) {
	return [{
		type: "text",
		text
	}];
}
/** 一个工具的统一文本输出 schema。 */
const TEXT_OUTPUT = {
	type: "object",
	additionalProperties: false,
	properties: { text: {
		type: "string",
		required: true
	} }
};
/**
* 数字助理网关：既是它的运行时（保证会话存在、派发、回报），
* 也是浏览器半边要用的 Remote（`jxAssistant.ensure`）。
*/
var JxAssistantGateway = class extends TypertRemoteService {
	/** 宿主服务依赖：缺一个就不挂载（web profile 全部具备）。 */
	static inject = [
		"agents",
		"sessions",
		"workspaceRegistry",
		"sessionQuery",
		"tools",
		"systemPrompt"
	];
	/** 数字助理会话的创建/恢复在途，避免并发重复建。 */
	creating;
	/** 在跑或已跑过的派发记录：sessionId → 记录。 */
	dispatches = /* @__PURE__ */ new Map();
	/** 本插件注册的事件的释放函数。 */
	disposers = [];
	constructor(ctx) {
		super(ctx, "jxAssistant");
		this.ctx.effect(() => () => {
			for (const dispose of this.disposers.splice(0)) try {
				dispose();
			} catch {}
		}, "dsh-digital-assistant: teardown");
		this.watchSessionEvents();
	}
	/** 宿主服务（结构化读取）。 */
	get agents() {
		return this.ctx.agents;
	}
	get registry() {
		return this.ctx.workspaceRegistry;
	}
	get sessionQuery() {
		return this.ctx.sessionQuery;
	}
	get tools() {
		return this.ctx.tools;
	}
	get presets() {
		return this.ctx.get("agentPresets");
	}
	get permissions() {
		return this.ctx.get("permissionPresets");
	}
	get defaultModel() {
		return this.ctx.get("agentDefaultModel");
	}
	/** 模型运行时（可选）：让数字助理看得见可选的提供方与模型。 */
	get llm() {
		return this.ctx.get("llm");
	}
	/** 会话标题服务（可选）：派发的会话由它写标题，绝不自己拼 session/title 事件。 */
	get sessionTitle() {
		return this.ctx.get("sessionTitle");
	}
	/**
	* 保证数字助理会话存在（活跃则直接返回，冷会话恢复，全新则创建），
	* 并把它的 id 交给浏览器半边用来跳转。
	* @returns 数字助理会话的 id。
	*/
	async ensure() {
		console.log("[dsh-digital-assistant] ensure(): 请求到达");
		try {
			const agent = await this.ensureAssistant();
			console.log(`[dsh-digital-assistant] ensure(): 完成 → ${agent.id}`);
			return { sessionId: agent.id };
		} catch (error) {
			console.error("[dsh-digital-assistant] ensure(): 失败", error);
			throw error;
		}
	}
	/** 数字助理会话的当前状态（诊断用）。 */
	async status() {
		const agent = await this.ensureAssistant();
		return {
			sessionId: agent.id,
			cwd: agent.session.header.cwd ?? ASSISTANT_CWD,
			running: agent.status === "running",
			dispatched: this.dispatches.size
		};
	}
	/** 取出（必要时建立）数字助理会话。 */
	async ensureAssistant() {
		const live = this.agents.get(ASSISTANT_SESSION_ID);
		if (live !== void 0) return live;
		if (this.creating !== void 0) return this.creating;
		const attempt = this.createOrResumeAssistant().finally(() => {
			if (this.creating === attempt) this.creating = void 0;
		});
		this.creating = attempt;
		return attempt;
	}
	/** 冷恢复优先、否则新建；两种路径都装上同一套提示词与工具。 */
	async createOrResumeAssistant() {
		const cwd = await this.ensureAssistantWorkspace();
		const setup = async (agentCtx) => {
			await this.composeAssistant(agentCtx);
		};
		const route = this.optionalRoute();
		const agentOptions = route === void 0 ? {} : { agentOptions: route };
		const persisted = await this.hasPersisted(ASSISTANT_SESSION_ID);
		let handle;
		if (persisted === false) handle = await this.agents.create({
			sessionId: ASSISTANT_SESSION_ID,
			meta: { cwd },
			...agentOptions,
			setup
		});
		else try {
			handle = await this.agents.resume({
				resumeSessionId: ASSISTANT_SESSION_ID,
				...agentOptions,
				setup
			});
		} catch (error) {
			if (persisted === true) throw error;
			this.warn(`冷恢复数字助理会话失败，改为新建：${String(error)}`);
			handle = await this.agents.create({
				sessionId: ASSISTANT_SESSION_ID,
				meta: { cwd },
				...agentOptions,
				setup
			});
		}
		const agent = handle.agent;
		await this.attachToWorkspace(agent.session, cwd);
		return agent;
	}
	/** 该会话是否已在持久化里：true/false，读不出来时是 undefined（未知）。 */
	async hasPersisted(sessionId) {
		try {
			return (await this.sessionQuery.listSessions()).some((record) => record.header.id === sessionId);
		} catch (error) {
			this.warn(`列举会话失败，按「未知」处理：${String(error)}`);
			return;
		}
	}
	/** 保证数字助理的落脚目录存在；返回它的路径（**不**登记为工作区）。 */
	async ensureAssistantWorkspace() {
		try {
			mkdirSync(ASSISTANT_CWD, { recursive: true });
		} catch (error) {
			this.warn(`建立数字助理落脚目录失败：${String(error)}`);
		}
		return ASSISTANT_CWD;
	}
	/** 把会话挂进它落脚目录对应的工作区（没有就当场登记一个）。 */
	async attachToWorkspace(session, cwd) {
		let workspace = this.registry.list().find((item) => samePath(item.path, cwd));
		if (workspace === void 0) try {
			workspace = await this.registry.create(cwd, ASSISTANT_WORKSPACE_TITLE);
		} catch (error) {
			this.warn(`登记数字助理工作区失败（会话将不属于任何工作区、入口可能打不开）：${String(error)}`);
			return;
		}
		try {
			await workspace.attachSession(session.id);
		} catch (error) {
			this.warn(`会话 ${session.id} 挂工作区失败（入口可能打不开）：${String(error)}`);
		}
	}
	/** 这个工作区是不是数字助理自己的落脚目录。 */
	isAssistantWorkspace(workspace) {
		return samePath(workspace.path, ASSISTANT_CWD);
	}
	/**
	* 在 agent 作用域里装提示词、官方提问工具与专属工具。
	* @param agentCtx - 该 agent 的作用域上下文（setup 回调给的那个）。
	*/
	async composeAssistant(agentCtx) {
		const scoped = agentCtx;
		const systemPrompt = scoped.systemPrompt;
		if (systemPrompt === void 0) this.warn("数字助理作用域里没有 systemPrompt 服务，专属提示词未注册。");
		else try {
			systemPrompt.section({
				name: PERSONA_SECTION,
				order: PERSONA_ORDER,
				text: ASSISTANT_PROMPT
			});
		} catch (error) {
			this.warn(`注册数字助理提示词失败：${String(error)}`);
		}
		try {
			const toolAskUser = await import("@deepseek-ai/dsh-tool-ask-user");
			scoped.plugin?.(toolAskUser);
		} catch (error) {
			this.warn(`挂提问工具失败（数字助理将无法提问确认完全访问）：${String(error)}`);
		}
		const tools = scoped.tools;
		if (tools === void 0) {
			this.warn("数字助理作用域里没有 tools 服务，专属工具未注册。");
			return;
		}
		for (const definition of this.buildTools()) try {
			tools.register(definition);
		} catch (error) {
			this.warn(`注册工具失败：${String(error)}`);
		}
		const allowed = [
			"ask_user_question",
			"todo_write",
			"todo_task_list",
			"todo_task_get",
			"todo_task_create",
			"todo_task_update",
			"todo_task_delete",
			"todo_task_run",
			"todo_workspace_list"
		].filter((candidate) => this.tools.get(candidate) !== void 0);
		try {
			if (allowed.length > 0) {
				tools.restrict({ allow: allowed });
				return;
			}
			const dangerous = [
				"bash",
				"pwsh",
				"read",
				"write",
				"edit",
				"read_image",
				"glob",
				"grep",
				"str_replace_editor",
				"terminal_open",
				"terminal_close",
				"terminal_list",
				"terminal_read",
				"terminal_send",
				"terminal_signal",
				"web_search",
				"web_fetch",
				"present",
				"skill",
				"lsp",
				"workflow",
				"ralph",
				"plugin_manager",
				"job_list",
				"job_output",
				"job_kill",
				"create_goal",
				"get_goal",
				"update_goal",
				"session_search",
				"session_trace",
				"session_event_read",
				"session_event_search",
				"session_event_trace"
			].filter((candidate) => this.tools.get(candidate) !== void 0);
			if (dangerous.length > 0) {
				tools.restrict({ deny: dangerous });
				this.warn(`全局层存在工具，已用黑名单挡掉 ${dangerous.length} 个读写/执行类工具。`);
			}
		} catch (error) {
			this.warn(`工具收窄失败：${String(error)}`);
		}
	}
	/** 构造数字助理的 8 个专属工具。 */
	buildTools() {
		return [
			this.listWorkspacesTool(),
			this.listSessionsTool(),
			this.listPresetsTool(),
			this.listModelsTool(),
			this.readSummaryTool(),
			this.dispatchTool(),
			this.sendToSessionTool(),
			this.createWorkspaceTool()
		];
	}
	listWorkspacesTool() {
		return defineTool({
			name: "list_workspaces",
			description: "列出用户已经建立过的工作区（id、名称、路径、会话数）。选目标之前先看这个。",
			parameters: {},
			output: {
				schema: TEXT_OUTPUT,
				render: (_args, value) => textBlock(value.text)
			},
			execute: async () => {
				const workspaces = this.registry.list().filter((item) => !this.isAssistantWorkspace(item));
				if (workspaces.length === 0) return { text: "（用户还没有建立任何工作区。要开工就自己建议一个目录路径、用 ask_user_question 问过用户，再用 create_workspace 建）" };
				return { text: workspaces.map((workspace) => `- ${workspace.title}｜id=${workspace.id}｜路径=${workspace.path}｜会话 ${workspace.sessionIds.length} 个`).join("\n") };
			}
		});
	}
	listSessionsTool() {
		return defineTool({
			name: "list_sessions",
			description: "列出最近的对话（默认 12 条，最多 40 条）：id、标题、所属工作区、创建时间、是否正在运行。用来判断新需求跟哪个对话相关。",
			parameters: { limit: {
				type: "number",
				description: `返回条数，默认 ${SESSIONS_DEFAULT_LIMIT}，上限 ${SESSIONS_MAX_LIMIT}。`
			} },
			output: {
				schema: TEXT_OUTPUT,
				render: (_args, value) => textBlock(value.text)
			},
			execute: async (args) => {
				const raw = typeof args.limit === "number" && Number.isFinite(args.limit) ? Math.floor(args.limit) : SESSIONS_DEFAULT_LIMIT;
				const limit = Math.min(Math.max(1, raw), SESSIONS_MAX_LIMIT);
				let records;
				try {
					records = await this.sessionQuery.listSessions();
				} catch (error) {
					return { text: `读取会话列表失败：${String(error)}` };
				}
				const workspaces = this.registry.list();
				const pick = records.filter((record) => record.header.id !== "session-jx-assistant" && record.header.origin !== "subagent").sort((left, right) => (right.header.createdAt ?? 0) - (left.header.createdAt ?? 0)).slice(0, limit);
				if (pick.length === 0) return { text: "（除我之外还没有别的对话）" };
				const lines = [];
				for (const record of pick) {
					const header = record.header;
					const workspace = workspaces.find((item) => header.cwd !== void 0 && samePath(item.path, header.cwd));
					const title = await this.readTitle(header.id);
					const running = this.agents.get(header.id)?.status === "running" ? "｜正在运行" : "";
					const dispatched = this.dispatches.has(header.id) ? "｜我派发的" : "";
					lines.push(`- ${title}｜id=${header.id}｜工作区=${workspace?.title ?? header.cwd ?? "未知"}｜${formatTime(header.createdAt)}${running}${dispatched}`);
				}
				return { text: lines.join("\n") };
			}
		});
	}
	listPresetsTool() {
		return defineTool({
			name: "list_presets",
			description: `列出这台机器上可用的模式（agent preset）及其 id。dispatch_task 的 preset 用这里的 id；拿不准就用 ${DEFAULT_PRESET}，或干脆不传。`,
			parameters: {},
			output: {
				schema: TEXT_OUTPUT,
				render: (_args, value) => textBlock(value.text)
			},
			execute: async () => {
				const presets = this.presets;
				if (presets === void 0 || typeof presets.list !== "function") return { text: `（这个部署没有提供模式服务；dispatch_task 不要传 preset，它会用默认的 ${DEFAULT_PRESET}）` };
				let rows;
				try {
					rows = await presets.list();
				} catch (error) {
					return { text: `读取模式列表失败：${String(error)}；dispatch_task 不传 preset 即可。` };
				}
				const usable = rows.filter((row) => row.broken !== true);
				if (usable.length === 0) return { text: `（没有可用模式；dispatch_task 不要传 preset）` };
				return { text: `${usable.map((row) => `- ${row.id}${row.name === void 0 ? "" : `｜${row.name}`}${row.description === void 0 ? "" : `（${row.description}）`}`).join("\n")}\n不特别说明时用 ${DEFAULT_PRESET}。` };
			}
		});
	}
	listModelsTool() {
		return defineTool({
			name: "list_models",
			description: "看有哪些模型可选：不带参数列出模型提供方 id，带 provider 列出它的模型。dispatch_task 的 provider/model 用这里返回的值；拿不准就别传，让新对话沿用用户当前的默认模型。",
			parameters: { provider: {
				type: "string",
				description: "模型提供方 id；省略则列出全部提供方。"
			} },
			output: {
				schema: TEXT_OUTPUT,
				render: (_args, value) => textBlock(value.text)
			},
			execute: async (args) => {
				const llm = this.llm;
				if (llm === void 0) return { text: "（这个部署没有模型服务；dispatch_task 不要传 provider/model，会用用户当前的默认模型）" };
				const provider = typeof args.provider === "string" ? args.provider.trim() : "";
				try {
					if (provider === "") {
						const providers = llm.listProviders();
						if (providers.length === 0) return { text: "（没有已注册的模型提供方）" };
						return { text: `${providers.map((item) => `- ${item.id}｜${item.name}`).join("\n")}\n（再带 provider 查一次可以看到它的模型；不指定 provider/model 就沿用用户当前的默认模型）` };
					}
					const models = await llm.listModels(provider);
					if (models.length === 0) return { text: `（${provider} 没有公布模型清单；它可能仍接受某个具体模型 id，但拿不准就别指定）` };
					return { text: models.map((model) => `- ${provider}/${model.id}｜${model.name}`).join("\n") };
				} catch (error) {
					return { text: `读取模型列表失败：${String(error)}；dispatch_task 不传 provider/model 即可。` };
				}
			}
		});
	}
	readSummaryTool() {
		return defineTool({
			name: "read_session_summary",
			description: "读某个对话做过什么的压缩摘要（轮数与步数、调用过哪些工具、中间与最后的正文、改动了哪些文件）。不返回思考内容和工具参数。",
			parameters: { session_id: {
				type: "string",
				required: true,
				description: "目标对话的 id。"
			} },
			output: {
				schema: TEXT_OUTPUT,
				render: (_args, value) => textBlock(value.text)
			},
			execute: async (args) => {
				const sessionId = typeof args.session_id === "string" ? args.session_id.trim() : "";
				if (sessionId === "") return { text: "需要给出 session_id。" };
				return { text: await this.describeSession(sessionId) };
			}
		});
	}
	dispatchTool() {
		return defineTool({
			name: "dispatch_task",
			description: "在指定工作区新建一个对话，把需求交给它后台执行。立刻返回新对话的 id；它跑完时你会收到压缩摘要。用户没同意不要用完全访问权限。",
			parameters: {
				task: {
					type: "string",
					required: true,
					description: "要交代给那个对话的完整需求（自足的一段话，别用「照上面说的」这类指代）。"
				},
				workspace_id: {
					type: "string",
					required: true,
					description: "目标工作区 id，来自 list_workspaces。"
				},
				preset: {
					type: "string",
					description: `模式（agent preset）id，默认 ${DEFAULT_PRESET}。`
				},
				provider: {
					type: "string",
					description: "模型提供方 id（与 model 同时给才生效）。"
				},
				model: {
					type: "string",
					description: "模型 id（与 provider 同时给才生效）。"
				},
				permission: {
					type: "string",
					enum: [
						"read-only",
						"workspace-write",
						"danger-full-access"
					],
					description: `权限预设，默认 ${DEFAULT_PERMISSION}。完全访问必须先经用户同意。`
				},
				user_confirmed: {
					type: "boolean",
					description: "仅在用户已通过提问明确同意完全访问权限时传 true。"
				},
				title: {
					type: "string",
					description: "给新对话起的标题（便于用户和我日后辨认），可省略。"
				}
			},
			output: {
				schema: TEXT_OUTPUT,
				render: (_args, value) => textBlock(value.text)
			},
			execute: async (args) => {
				const task = typeof args.task === "string" ? args.task.trim() : "";
				if (task === "") return { text: "需要 task（要交代给那个对话的需求）。" };
				const workspace = this.registry.get(args.workspace_id);
				if (workspace === void 0) return { text: `找不到工作区 ${JSON.stringify(args.workspace_id)}。先用 list_workspaces 看有哪些，或者问用户要不要新建一个。` };
				if (this.isAssistantWorkspace(workspace)) return { text: `工作区「${workspace.title}」是数字助理自己的家，不能把活派到那里。请改用 list_workspaces 里的某个用户工作区；没有合适的就先建议一个目录路径、问过用户后再用 create_workspace 建。` };
				const permission = typeof args.permission === "string" && args.permission !== "" ? args.permission : DEFAULT_PERMISSION;
				if (permission === FULL_ACCESS_PERMISSION && args.user_confirmed !== true) return { text: "完全访问权限（danger-full-access）没有被用户确认。请先用 ask_user_question 说明「为什么需要完全访问」「会动到工作区之外的什么」，拿到用户的明确同意后，再带上 user_confirmed=true 重新调用。用户不同意就改用 workspace-write。" };
				try {
					return { text: `已开工：会话 ${await this.createDispatchedSession({
						task,
						workspace,
						permission,
						...typeof args.preset === "string" && args.preset !== "" ? { preset: args.preset } : {},
						...typeof args.provider === "string" && args.provider !== "" ? { provider: args.provider } : {},
						...typeof args.model === "string" && args.model !== "" ? { model: args.model } : {},
						...typeof args.title === "string" && args.title !== "" ? { title: args.title } : {}
					})}（工作区「${workspace.title}」，权限 ${permission}，${this.describeRoute(args.provider, args.model)}）。它在后台跑，跑完我会收到摘要并汇报给用户；现在可以先回用户一句「已经派下去了」。` };
				} catch (error) {
					return { text: `开工失败：${String(error)}` };
				}
			}
		});
	}
	sendToSessionTool() {
		return defineTool({
			name: "send_to_session",
			description: "把新需求追加给一个已有对话（相关且不复杂时优先这样做，上下文是连续的）。它跑完时你会收到压缩摘要。",
			parameters: {
				session_id: {
					type: "string",
					required: true,
					description: "目标对话 id。"
				},
				task: {
					type: "string",
					required: true,
					description: "完整、自足的一段需求。"
				}
			},
			output: {
				schema: TEXT_OUTPUT,
				render: (_args, value) => textBlock(value.text)
			},
			execute: async (args) => {
				const sessionId = typeof args.session_id === "string" ? args.session_id.trim() : "";
				const task = typeof args.task === "string" ? args.task.trim() : "";
				if (sessionId === "" || task === "") return { text: "需要 session_id 与 task。" };
				try {
					const agent = await this.ensureLiveAgent(sessionId);
					agent.followup(createUserMessage({
						content: [{
							type: "text",
							text: `【数字助理转达】\n\n${task}`
						}],
						source: { kind: "user" }
					}));
					const workspaceTitle = this.workspaceTitleOf(agent.session);
					this.dispatches.set(sessionId, {
						...workspaceTitle === void 0 ? {} : { workspaceTitle },
						task,
						active: true,
						reportedTurns: /* @__PURE__ */ new Set()
					});
					return { text: `已把需求追加给会话 ${sessionId}。它跑完我会收到摘要。` };
				} catch (error) {
					return { text: `追加失败：${String(error)}` };
				}
			}
		});
	}
	createWorkspaceTool() {
		return defineTool({
			name: "create_workspace",
			description: "新建一个工作区（目录不存在会自动创建）。只在用户已明确同意这个路径之后调用。",
			parameters: {
				path: {
					type: "string",
					required: true,
					description: "工作区目录的绝对路径。"
				},
				title: {
					type: "string",
					description: "显示名称，省略时用目录名。"
				}
			},
			output: {
				schema: TEXT_OUTPUT,
				render: (_args, value) => textBlock(value.text)
			},
			execute: async (args) => {
				const path = typeof args.path === "string" ? args.path.trim() : "";
				if (path === "") return { text: "需要 path（目录绝对路径）。" };
				try {
					mkdirSync(path, { recursive: true });
					const workspace = await this.registry.create(path, typeof args.title === "string" && args.title !== "" ? args.title : void 0);
					return { text: `已建立工作区「${workspace.title}」（id=${workspace.id}，路径=${workspace.path}）。` };
				} catch (error) {
					return { text: `建立工作区失败：${String(error)}` };
				}
			}
		});
	}
	/**
	* 决定一个会话的模型路由：调用方指定的优先，否则用全局默认。
	* 必须总有值——会话的 `{{model}}` 提示词变量取自 `agent.options.model`，
	* 缺了它、又挂着会用到该变量的预设，第一次组装提示词就会失败。
	* @param provider - 调用方指定的提供方（与 model 成对）。
	* @param model - 调用方指定的模型。
	* @returns 可直接当 `agentOptions` 用的路由。
	*/
	resolveRoute(provider, model) {
		if (typeof provider === "string" && provider !== "" && typeof model === "string" && model !== "") return {
			provider,
			model
		};
		const current = this.defaultModel?.currentSelection();
		if (current !== void 0 && typeof current.provider === "string" && current.provider !== "" && typeof current.model === "string" && current.model !== "") return {
			provider: current.provider,
			model: current.model
		};
		throw new Error("无法确定模型：agent-default-model 服务不可用，请在 dispatch_task 里显式给出 provider 与 model。");
	}
	/** 拿得到就用、拿不到就算了（只给数字助理自己的会话用，它不挂预设、只用到 {{cwd}}）。 */
	optionalRoute() {
		try {
			return this.resolveRoute();
		} catch {
			return;
		}
	}
	/** 派发结果里说明这次用的哪个模型。 */
	describeRoute(provider, model) {
		const explicit = typeof provider === "string" && provider !== "" && typeof model === "string" && model !== "";
		try {
			const route = this.resolveRoute(provider, model);
			return explicit ? `模型 ${route.provider}/${route.model}` : `模型沿用当前默认 ${route.provider}/${route.model}`;
		} catch {
			return "模型未能确定";
		}
	}
	/** 建一个顶层会话、设权限与模型、投递需求，并登记回报。 */
	async createDispatchedSession(input) {
		const sessionId = `session-${randomUUID()}`;
		const presets = this.presets;
		let presetId;
		if (presets !== void 0) presetId = (await presets.resolve(input.preset ?? DEFAULT_PRESET)).id;
		const route = this.resolveRoute(input.provider, input.model);
		const agent = (await this.agents.create({
			sessionId,
			meta: {
				cwd: input.workspace.path,
				...presetId === void 0 ? {} : { agentPreset: presetId }
			},
			agentOptions: route,
			setup: async (agentCtx) => {
				if (presets === void 0 || presetId === void 0) return;
				await presets.mount(agentCtx, presetId);
			}
		})).agent;
		try {
			await input.workspace.attachSession(sessionId);
		} catch (error) {
			this.warn(`新会话 ${sessionId} 挂工作区失败：${String(error)}`);
		}
		const permissions = this.permissions;
		if (permissions !== void 0) try {
			permissions.resolve(input.permission);
			permissions.set(agent.session, input.permission);
		} catch (error) {
			this.warn(`设置权限 ${input.permission} 失败：${String(error)}`);
		}
		if (input.title !== void 0) try {
			this.sessionTitle?.rename(agent.session, input.title);
		} catch (error) {
			this.warn(`写标题失败：${String(error)}`);
		}
		agent.followup(createUserMessage({
			content: [{
				type: "text",
				text: `【数字助理派发】\n\n${input.task}`
			}],
			source: { kind: "user" }
		}));
		this.dispatches.set(sessionId, {
			workspaceTitle: input.workspace.title,
			task: input.task,
			active: true,
			reportedTurns: /* @__PURE__ */ new Set()
		});
		return sessionId;
	}
	/** 取活跃 agent；冷会话按它记录的 preset 恢复。 */
	async ensureLiveAgent(sessionId) {
		const live = this.agents.get(sessionId);
		if (live !== void 0) return live;
		const presetId = (await this.sessionQuery.readSession(sessionId)).session.agentPreset;
		const presets = this.presets;
		return (await this.agents.resume({
			resumeSessionId: sessionId,
			agentOptions: this.resolveRoute(),
			setup: async (agentCtx) => {
				if (presets === void 0 || presetId === void 0) return;
				await presets.mount(agentCtx, presetId);
			}
		})).agent;
	}
	/** 盯住派发出去的会话：turn/end 一到就折叠摘要回送数字助理。 */
	watchSessionEvents() {
		const dispose = this.ctx.on("session/event", (session, event) => {
			const record = this.dispatches.get(session.id);
			if (record === void 0 || !record.active) return;
			if (event.type !== "turn/end") return;
			const turn = typeof event.data?.turn === "number" ? event.data.turn : -1;
			if (record.reportedTurns.has(turn)) return;
			record.reportedTurns.add(turn);
			record.active = false;
			this.reportCompletion(session.id).catch((error) => {
				this.warn(`回报会话 ${session.id} 失败：${String(error)}`);
			});
		});
		this.disposers.push(dispose);
	}
	/** 读日志 → 折叠 → 作为一条消息送进数字助理。 */
	async reportCompletion(sessionId) {
		const record = this.dispatches.get(sessionId);
		const assistant = await this.ensureAssistant();
		const text = await this.describeSession(sessionId);
		const head = record === void 0 ? `【派发回报】会话 ${sessionId} 这一轮结束了。` : `【派发回报】你派给工作区「${record.workspaceTitle ?? "未知"}」的那个对话（${sessionId}）这一轮结束了。`;
		assistant.followup(createUserMessage({
			content: [{
				type: "text",
				text: `${head}\n\n${text}\n\n请用用户听得懂的话向他汇报这件事的进展。`
			}],
			source: {
				kind: "plugin",
				plugin: "dsh-digital-assistant"
			}
		}));
	}
	/** 把一个会话折叠成摘要文本（工具与回报共用）。 */
	async describeSession(sessionId) {
		let snapshot;
		try {
			snapshot = await this.sessionQuery.readSession(sessionId);
		} catch (error) {
			return `读会话 ${sessionId} 的日志失败：${String(error)}`;
		}
		const summary = summarizeSession(snapshot.events);
		const title = await this.readTitle(sessionId);
		const workspaceTitle = this.workspaceTitleOfPath(snapshot.session.cwd);
		const record = this.dispatches.get(sessionId);
		return renderSummaryText(summary, {
			sessionId,
			...title === void 0 ? {} : { title },
			...workspaceTitle === void 0 ? {} : { workspaceTitle },
			...record === void 0 ? {} : { task: record.task }
		});
	}
	/** 读会话标题；读不到就返回 undefined。 */
	async readTitle(sessionId) {
		const readTitle = this.sessionQuery.readTitle;
		if (typeof readTitle !== "function") return void 0;
		try {
			const title = (await readTitle.call(this.sessionQuery, sessionId))?.title;
			return typeof title === "string" && title.trim() !== "" ? title : void 0;
		} catch {
			return;
		}
	}
	/** 按 cwd 找它所属工作区的标题。 */
	workspaceTitleOfPath(cwd) {
		if (cwd === void 0) return void 0;
		return this.registry.list().find((item) => samePath(item.path, cwd))?.title;
	}
	/** 按会话取工作区标题。 */
	workspaceTitleOf(session) {
		return this.workspaceTitleOfPath(session.header.cwd);
	}
	/** 统一的告警出口（模组不静默吞错）。 */
	warn(message) {
		try {
			console.warn(`[dsh-digital-assistant] ${message}`);
		} catch {}
	}
};
Object.defineProperty(JxAssistantGateway.prototype, "@deepseek-ai/dsh-typert-protocol/remote-methods", {
	configurable: true,
	value: Object.freeze({
		version: 1,
		methods: Object.freeze([{
			method: "ensure",
			invocation: Object.freeze({ kind: "direct" })
		}, {
			method: "status",
			invocation: Object.freeze({ kind: "direct" })
		}])
	})
});
//#endregion
export { ASSISTANT_CWD, ASSISTANT_SESSION_ID, JxAssistantGateway, JxAssistantGateway as default, name };
