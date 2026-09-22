import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
/** 解析 `HH:mm` 为当天分钟数；格式不对返回 undefined。 */
function parseTimeToMinutes(time) {
	const match = /^(\d{1,2}):(\d{2})$/u.exec(time);
	if (match === null) return void 0;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return void 0;
	if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return void 0;
	return hours * 60 + minutes;
}
/** 本地时区「某天 @ 当天分钟数」的 epoch 毫秒。 */
function slotOnDay(day, minutes) {
	return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0).getTime();
}
/** 「<= now 的最近一个每天槽点」（今天或昨天）。 */
function lastDailySlot(now, minutes) {
	const day = new Date(now);
	const today = slotOnDay(day, minutes);
	if (today <= now) return today;
	return slotOnDay(new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1), minutes);
}
/** 「> from 的下一个每天槽点」。 */
function nextDailySlot(from, minutes) {
	const day = new Date(from);
	const today = slotOnDay(day, minutes);
	if (today > from) return today;
	return slotOnDay(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1), minutes);
}
/** 当天是否匹配 weekly 的 `days`（0=周日…6=周六）。 */
function matchesDays(day, days) {
	return days.includes(day.getDay());
}
/** 「<= now 的最近一个匹配 `days` 的槽点」（最多往回找 7 天）。 */
function lastWeeklySlot(now, days, minutes) {
	const day = new Date(now);
	for (let back = 0; back < 8; back += 1) {
		const cursor = new Date(day.getFullYear(), day.getMonth(), day.getDate() - back);
		if (matchesDays(cursor, days)) {
			const slot = slotOnDay(cursor, minutes);
			if (slot <= now) return slot;
		}
	}
}
/** 「> from 的下一个匹配 `days` 的槽点」（最多往后找 7 天）。 */
function nextWeeklySlot(from, days, minutes) {
	const day = new Date(from);
	for (let ahead = 0; ahead < 8; ahead += 1) {
		const cursor = new Date(day.getFullYear(), day.getMonth(), day.getDate() + ahead);
		if (matchesDays(cursor, days)) {
			const slot = slotOnDay(cursor, minutes);
			if (slot > from) return slot;
		}
	}
}
/** 周一…周五。 */
function isWeekday(day) {
	const weekday = day.getDay();
	return weekday >= 1 && weekday <= 5;
}
/** 「<= now 的最近一个工作日槽点」。 */
function lastWeekdaySlot(now, minutes) {
	const day = new Date(now);
	for (let back = 0; back < 8; back += 1) {
		const cursor = new Date(day.getFullYear(), day.getMonth(), day.getDate() - back);
		if (isWeekday(cursor)) {
			const slot = slotOnDay(cursor, minutes);
			if (slot <= now) return slot;
		}
	}
	return now;
}
/** 「> from 的下一个工作日槽点」。 */
function nextWeekdaySlot(from, minutes) {
	const day = new Date(from);
	for (let ahead = 1; ahead < 9; ahead += 1) {
		const cursor = new Date(day.getFullYear(), day.getMonth(), day.getDate() + ahead);
		if (isWeekday(cursor)) return slotOnDay(cursor, minutes);
	}
	return from;
}
/** 时间非法（`HH:mm` 解析失败）时，几种按时刻的方式都没有槽点。 */
function minuteOf(schedule) {
	const parsed = parseTimeToMinutes("time" in schedule ? schedule.time : "");
	return parsed === void 0 ? void 0 : parsed;
}
/**
* 展示用「下次执行时间」；不自动执行（manual）或永不匹配（weekly 空天集、时间非法、
* once 已过期）时是 undefined。
*/
function computeNextRunAt(schedule, from, lastRunAt) {
	switch (schedule.kind) {
		case "manual": return;
		case "once": return schedule.at > from ? schedule.at : void 0;
		case "daily": {
			const minutes = minuteOf(schedule);
			return minutes === void 0 ? void 0 : nextDailySlot(from, minutes);
		}
		case "weekly": {
			const minutes = minuteOf(schedule);
			if (minutes === void 0 || schedule.days.length === 0) return void 0;
			return nextWeeklySlot(from, schedule.days, minutes);
		}
		case "weekdays": {
			const minutes = minuteOf(schedule);
			return minutes === void 0 ? void 0 : nextWeekdaySlot(from, minutes);
		}
		case "interval": {
			const every = schedule.everyMinutes * 6e4;
			if (!Number.isFinite(every) || every <= 0) return void 0;
			const next = (lastRunAt ?? from) + every;
			return next > from ? next : from + every;
		}
	}
}
/**
* 调度循环用：现在这一拍要不要触发，返回「本次槽点」（写进 lastRunAt 的那个值）。
* 只认刚到的槽点：`slot <= now` 且 `slot > lastRunAt`；间隔类落后超过一个节拍
* （加宽限）就不自动追——那种情况属于错过，走 `detectMissed` 由用户决定。
*/
function computeDueSlot(schedule, now, lastRunAt, anchor) {
	if (schedule.kind === "manual") return void 0;
	const ran = lastRunAt ?? Number.NEGATIVE_INFINITY;
	switch (schedule.kind) {
		case "once": return schedule.at <= now && schedule.at > ran && now - schedule.at <= 6e5 ? schedule.at : void 0;
		case "daily":
		case "weekdays":
		case "weekly": {
			const minutes = minuteOf(schedule);
			if (minutes === void 0) return void 0;
			if (schedule.kind === "weekly" && !matchesDays(new Date(now), schedule.days)) return void 0;
			if (schedule.kind === "weekdays" && !isWeekday(new Date(now))) return void 0;
			const slot = slotOnDay(new Date(now), minutes);
			return slot <= now && slot > ran && now - slot <= 6e5 ? slot : void 0;
		}
		case "interval": {
			const every = schedule.everyMinutes * 6e4;
			if (!Number.isFinite(every) || every <= 0) return void 0;
			const next = (lastRunAt ?? anchor) + every;
			if (next > now) return void 0;
			if (now - next > every + 6e4) return void 0;
			return next;
		}
	}
}
/**
* 错过检测：服务没开着时错过的**最近一个**槽点（`slot < now && slot > lastRunAt`）；
* 没有错过返回 undefined。循环类只回最近一个，不连环。
*/
function detectMissed(schedule, now, lastRunAt, anchor) {
	if (schedule.kind === "manual") return void 0;
	const ran = lastRunAt ?? Number.NEGATIVE_INFINITY;
	switch (schedule.kind) {
		case "once": return schedule.at < now && schedule.at > ran ? schedule.at : void 0;
		case "daily": {
			const minutes = minuteOf(schedule);
			if (minutes === void 0) return void 0;
			const slot = lastDailySlot(now, minutes);
			return slot < now && slot > ran ? slot : void 0;
		}
		case "weekly": {
			const minutes = minuteOf(schedule);
			if (minutes === void 0 || schedule.days.length === 0) return void 0;
			const slot = lastWeeklySlot(now, schedule.days, minutes);
			return slot !== void 0 && slot < now && slot > ran ? slot : void 0;
		}
		case "weekdays": {
			const minutes = minuteOf(schedule);
			if (minutes === void 0) return void 0;
			const slot = lastWeekdaySlot(now, minutes);
			return slot < now && slot > ran ? slot : void 0;
		}
		case "interval": {
			const every = schedule.everyMinutes * 6e4;
			if (!Number.isFinite(every) || every <= 0) return void 0;
			const next = (lastRunAt ?? anchor) + every;
			return next < now - (every + 6e4) && next > ran ? next : void 0;
		}
	}
}
//#endregion
//#region src/index.ts
/**
* 待办事项与定时任务 —— 宿主半边。
*
* 一份持久化的任务清单（`DSH_HOME\jx-todo\tasks.json`，原子写）+ 一个 20 秒一拍的
* 调度循环。任务分两类：
* - **assistant（AI 任务）**：到点把描述转交给数字助理主对话（`ctx.get('jxAssistant')`
*   的 `ensure()` 保证会话在场，再以用户消息投递），由数字助理按它自己的提示词安排
*   执行（派发子会话、选工作区、选模型都是它的事）并在完成后向用户汇报。这里不做
*   任何模型/模式设置，也**不**等它跑完——记录落「已转交」即完成。
* - **command（程序任务）**：到点用官方 `ctx.subprocess` 在指定工作目录直接运行命令
*   （显式 argv、不过 shell、输出上限、超时中止），退出码与输出节选进执行记录。
*
* 防重复触发：每一拍先算「刚到的槽点」，触发前立刻把 `lastRunAt` 落盘为该槽点，
* 同一任务在途时（`dispatching`）不再触发；时间未到的槽点一律不跑。
* 程序没开着错过的执行不自动补跑：`detectMissed` 找出**最近一个**错过的槽点，
* 由页面提示用户「补跑 / 忽略」。
*/
const name = "dsh-todo-scheduler";
const REPO_ROOT = resolve(resolve(resolve(dirname(fileURLToPath(import.meta.url)), ".."), ".."), "..");
/** 数据文件：`dsh-home\jx-todo\tasks.json`（目录自动创建）。 */
const TODO_DATA_FILE = join(process.env.DSH_HOME ?? join(REPO_ROOT, "dsh-home"), "jx-todo", "tasks.json");
/** 调度循环的节拍。 */
const TICK_MS = 2e4;
/** 执行记录最多保留多少条（超出裁掉最旧的）。 */
const MAX_RECORDS = 200;
/** 程序任务的单次超时与收尾宽限。 */
const COMMAND_TIMEOUT_MS = 10 * 6e4;
const COMMAND_GRACE_MS = 2e3;
/** 程序任务输出上限：stdout 记录多取一些，stderr 节选进错误。 */
const COMMAND_STDOUT_BYTES = 64 * 1024;
const COMMAND_STDERR_BYTES = 16 * 1024;
/** 触发方式的中文标签（写进派发消息与记录）。 */
const TRIGGER_LABELS = {
	schedule: "定时触发",
	manual: "手动执行",
	"catch-up": "错过补跑"
};
/** 预置任务（不定时，只记着不自动执行）：老数据缺哪条就补哪条，按 id 幂等。 */
function makeSeedTasks() {
	const now = Date.now();
	return [{
		id: "task-jx-mobile-access",
		title: "手机端访问：解锁局域网 + 扫码入口",
		description: [
			"按《手机端访问实施方案.md》的结论做第一步和第二步：",
			"",
			"1) 让 DSH 的 web 服务能绑定局域网地址，使手机在同一 Wi-Fi 下可访问（官方 CLI 层的 --host 0.0.0.0 限制不要硬改，走配置/启动器层面实现，并确认服务窗口会打印 LAN 地址与带 token 的链接）；",
			"2) 做一个扫码入口（网页上显示二维码，或在启动窗口打印二维码），手机扫码后凭 token 换取 30 天有效的 Cookie，实现免登录进入。",
			"",
			"本阶段先不做手机端样式适配（侧栏抽屉、软键盘、safe-area 等），那是后续单独一步。",
			"要求：说明安全影响并给出限制措施（token 有效期、仅内网使用），不要动正在使用的 3080 实例配置。",
			"",
			"参考文档：D:\\Desktop\\童浩\\智能体工作目录\\手机端访问实施方案.md"
		].join("\n"),
		enabled: true,
		executor: "assistant",
		schedule: { kind: "manual" },
		target: { workspaceId: "" },
		createdAt: now,
		updatedAt: now
	}, {
		id: "task-assistant-unread",
		title: "数字助理主对话：有新回复但前端没有提示",
		description: [
			"现象：在侧边栏左上角「数字助理」入口的主对话里，助理回复后前端没有任何提示（入口框不变色、没有未读标记），用户不知道已经回复了。",
			"",
			"要的效果：收到新回复时有明显的视觉提示（入口/会话框高亮、未读角标、变色加粗，必要时声音或系统通知），看过即消失。",
			"",
			"实现前先复现并定位原因：是「数字助理这个特殊会话没有接上未读机制」，还是「入口渲染路径不同导致提示没画出来」；参考官方 dsh-unread 插件的机制来接，注意与它不冲突、不要出现两份提示。"
		].join("\n"),
		enabled: true,
		executor: "assistant",
		schedule: { kind: "manual" },
		target: { workspaceId: "" },
		createdAt: now,
		updatedAt: now
	}];
}
/** 首启种子数据。 */
function seedData() {
	return {
		version: 2,
		tasks: makeSeedTasks(),
		records: []
	};
}
/** 老数据文件缺某条预置任务时补上（按 id 判断；已在场的条目不动，尊重用户改动）。 */
function ensureSeedTasks(data) {
	const present = new Set(data.tasks.map((task) => task.id));
	const missing = makeSeedTasks().filter((seed) => !present.has(seed.id));
	if (missing.length === 0) return data;
	return {
		...data,
		tasks: [...data.tasks, ...missing]
	};
}
/** 数据 v1 → v2：旧任务没有 executor 字段，一律视为 AI 任务（当时的唯一行为）。 */
function migrateV1(parsed) {
	return {
		version: 2,
		tasks: parsed.tasks.map((task) => ({
			...task,
			executor: task.executor ?? "assistant"
		})),
		records: parsed.records
	};
}
/** 从磁盘读数据；文件不存在返回种子；文件损坏则把坏文件改名保留并返回种子；缺预置任务时补种。 */
function loadData(file) {
	if (!existsSync(file)) return seedData();
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8"));
		if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.records)) throw new Error("数据文件形状不对（version/tasks/records）");
		if (parsed.version === 1) return ensureSeedTasks(migrateV1(parsed));
		if (parsed.version !== 2) throw new Error(`数据文件版本不支持：${String(parsed.version)}`);
		return ensureSeedTasks(parsed);
	} catch (error) {
		try {
			renameSync(file, `${file}.bad-${Date.now()}`);
		} catch {}
		console.warn(`[dsh-todo-scheduler] 数据文件损坏（已改名保留），按空清单重建：${String(error)}`);
		return seedData();
	}
}
/** 校验执行方式，不合法当场抛错（新建/更新入口）。 */
function assertValidSchedule(schedule) {
	switch (schedule.kind) {
		case "manual": return;
		case "once":
			if (!Number.isFinite(schedule.at)) throw new Error("定时执行需要一个有效的时间");
			return;
		case "daily":
		case "weekdays":
			if (parseTimeToMinutes(schedule.time) === void 0) throw new Error(`时刻必须是 HH:mm，收到 ${JSON.stringify(schedule.time)}`);
			return;
		case "weekly":
			if (parseTimeToMinutes(schedule.time) === void 0) throw new Error(`时刻必须是 HH:mm，收到 ${JSON.stringify(schedule.time)}`);
			if (schedule.days.length === 0 || schedule.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error("每周执行需要至少勾选一个有效的星期（0=周日 … 6=周六）");
			return;
		case "interval":
			if (!Number.isInteger(schedule.everyMinutes) || schedule.everyMinutes < 1 || schedule.everyMinutes > 1440 * 30) throw new Error("间隔必须是 1 到 43200 之间的整数分钟");
			return;
	}
}
/** 校验任务类型与它的配套字段；返回规范化后的值。 */
function normalizeExecutor(executor, target, command) {
	if (executor === void 0 || executor === "assistant") return {
		executor: "assistant",
		target: { workspaceId: "" },
		command: void 0
	};
	if (typeof command?.command !== "string" || command.command.trim() === "") throw new Error("程序任务需要填写要运行的命令");
	if (typeof target.workspaceId !== "string" || target.workspaceId.trim() === "") throw new Error("程序任务必须先选择工作目录（目标工作区），命令在那里运行");
	return {
		executor: "command",
		target: { workspaceId: target.workspaceId },
		command: {
			command: command.command.trim(),
			args: typeof command.args === "string" ? command.args : ""
		}
	};
}
/** 把一段输出截成摘要用的短文本。 */
function clip(text, max) {
	const flat = text.replace(/\s+$/u, "");
	return flat.length <= max ? flat : `${flat.slice(0, max)}…（已截断）`;
}
/**
* 待办事项与定时任务网关：持久化 + 调度 + 分流执行，同时是浏览器半边用的
* Remote（`jxTodo.*`）。
*/
var JxTodoGateway = class extends TypertRemoteService {
	dataFile;
	/** 宿主服务依赖：缺一个就不挂载。 */
	static inject = ["agents", "workspaceRegistry"];
	/** 内部可变副本（持久化形状见 TodoData）。 */
	tasks;
	records;
	/** 在途执行（按任务 id），防同一任务并发/重复触发。 */
	dispatching = /* @__PURE__ */ new Set();
	/** 调度循环定时器。 */
	timer;
	/**
	* @param ctx - 宿主上下文。
	* @param dataFile - 数据文件路径（自测重定向到临时目录）。
	*/
	constructor(ctx, dataFile = TODO_DATA_FILE) {
		super(ctx, "jxTodo");
		this.dataFile = dataFile;
		const loaded = loadData(dataFile);
		this.tasks = [...loaded.tasks];
		this.records = [...loaded.records];
		this.ctx.effect(() => {
			this.timer = setInterval(() => {
				this.tick();
			}, TICK_MS);
			this.timer.unref?.();
			return () => {
				clearInterval(this.timer);
			};
		}, "dsh-todo-scheduler: tick");
		this.save();
	}
	get agents() {
		return this.ctx.agents;
	}
	get registry() {
		return this.ctx.workspaceRegistry;
	}
	get assistantGateway() {
		return this.ctx.get("jxAssistant");
	}
	get subprocess() {
		return this.ctx.get("subprocess");
	}
	/** 部署概要（诊断用）。 */
	async status() {
		const snapshotTasks = this.tasks;
		return {
			taskCount: snapshotTasks.length,
			enabledCount: snapshotTasks.filter((task) => task.enabled).length,
			missedCount: this.collectMissed().length,
			dataFile: this.dataFile
		};
	}
	/** 全部任务（按下次执行时间排序）+ 最近执行记录 + 已错过的槽点。 */
	async listTasks() {
		const now = Date.now();
		const views = this.tasks.map((task) => this.toView(task, now));
		const order = (task) => {
			if (task.enabled && task.nextRunAt !== void 0) return task.nextRunAt;
			if (task.enabled && task.schedule.kind !== "manual") return Number.MAX_SAFE_INTEGER - 1;
			return Number.MAX_SAFE_INTEGER;
		};
		views.sort((left, right) => order(left) - order(right) || right.updatedAt - left.updatedAt);
		return {
			tasks: views,
			records: this.records.slice(-200).reverse(),
			missed: this.collectMissed(),
			dataFile: this.dataFile
		};
	}
	/** 新建一条任务。 */
	async createTask(request) {
		const title = typeof request.title === "string" ? request.title.trim() : "";
		if (title === "") throw new Error("任务标题不能为空");
		const description = typeof request.description === "string" ? request.description.trim() : "";
		if (description === "") throw new Error("任务描述不能为空（将来要原样派出去）");
		assertValidSchedule(request.schedule);
		const settled = normalizeExecutor(request.executor, request.target, request.command);
		const now = Date.now();
		const task = {
			id: `task-${randomUUID().slice(0, 8)}`,
			title,
			description,
			enabled: request.enabled !== false,
			executor: settled.executor,
			schedule: request.schedule,
			target: settled.target,
			...settled.command === void 0 ? {} : { command: settled.command },
			createdAt: now,
			updatedAt: now
		};
		this.tasks.push(task);
		this.save();
		console.log(`[dsh-todo-scheduler] 新建任务 ${task.id}「${task.title}」（${task.executor}/${task.schedule.kind}）`);
		return { task: this.toView(task, now) };
	}
	/** 更新一条任务（给出的字段整体替换；执行方式变化时重置调度基准）。 */
	async updateTask(request) {
		const task = this.tasks.find((item) => item.id === request.id);
		if (task === void 0) throw new Error(`找不到任务 ${JSON.stringify(request.id)}`);
		const patch = request.patch;
		let next = task;
		if (patch.title !== void 0) {
			const title = patch.title.trim();
			if (title === "") throw new Error("任务标题不能为空");
			next = {
				...next,
				title
			};
		}
		if (patch.description !== void 0) {
			const description = patch.description.trim();
			if (description === "") throw new Error("任务描述不能为空（将来要原样派出去）");
			next = {
				...next,
				description
			};
		}
		if (patch.enabled !== void 0) next = {
			...next,
			enabled: patch.enabled === true
		};
		if (patch.schedule !== void 0) {
			assertValidSchedule(patch.schedule);
			next = {
				...next,
				schedule: patch.schedule,
				lastRunAt: void 0
			};
		}
		if (patch.executor !== void 0 || patch.target !== void 0 || patch.command !== void 0) {
			const settled = normalizeExecutor(patch.executor ?? next.executor, patch.target ?? next.target, patch.command ?? next.command);
			const scheduleChanged = patch.schedule !== void 0;
			next = {
				...next,
				executor: settled.executor,
				target: settled.target,
				...settled.command === void 0 ? { command: void 0 } : { command: settled.command },
				...scheduleChanged || patch.executor !== void 0 ? { lastRunAt: void 0 } : {}
			};
		}
		next = {
			...next,
			updatedAt: Date.now()
		};
		this.tasks.splice(this.tasks.indexOf(task), 1, next);
		this.save();
		return { task: this.toView(next, next.updatedAt) };
	}
	/** 删除一条任务（执行记录保留，任务 id 仍在记录里可读）。 */
	async deleteTask(request) {
		const index = this.tasks.findIndex((item) => item.id === request.id);
		if (index === -1) throw new Error(`找不到任务 ${JSON.stringify(request.id)}`);
		this.tasks.splice(index, 1);
		this.save();
		return { ok: true };
	}
	/** 立即执行一次（不等调度）。 */
	async runNow(request) {
		const task = this.tasks.find((item) => item.id === request.id);
		if (task === void 0) throw new Error(`找不到任务 ${JSON.stringify(request.id)}`);
		try {
			const sessionId = await this.dispatch(task, { kind: "manual" });
			return {
				ok: true,
				...sessionId === void 0 ? {} : { sessionId }
			};
		} catch (error) {
			return {
				ok: false,
				error: String(error)
			};
		}
	}
	/** 处理一条已错过的槽点：补跑一次，或标记忽略。 */
	async resolveMissed(request) {
		const task = this.tasks.find((item) => item.id === request.id);
		if (task === void 0) throw new Error(`找不到任务 ${JSON.stringify(request.id)}`);
		const now = Date.now();
		if (request.action === "dismiss") {
			this.patchTask(task.id, { lastRunAt: Math.max(task.lastRunAt ?? 0, now) });
			this.save();
			return { ok: true };
		}
		this.patchTask(task.id, { lastRunAt: Math.max(task.lastRunAt ?? 0, now) });
		try {
			await this.dispatch(task, { kind: "catch-up" });
		} catch (error) {
			this.save();
			throw error;
		}
		this.save();
		return { ok: true };
	}
	/** 工作区下拉项（程序任务的工作目录）。 */
	async listWorkspaces() {
		return { items: this.registry.list().map((workspace) => ({
			id: workspace.id,
			title: workspace.title,
			path: workspace.path
		})) };
	}
	/** 一拍：找出每条启用任务「刚到的槽点」，至多触发一次。 */
	tick() {
		const now = Date.now();
		for (const task of [...this.tasks]) {
			if (!task.enabled) continue;
			if (this.dispatching.has(task.id)) continue;
			const slot = computeDueSlot(task.schedule, now, task.lastRunAt, task.createdAt);
			if (slot === void 0) continue;
			this.dispatching.add(task.id);
			this.dispatch(task, {
				kind: "schedule",
				slot
			}).catch((error) => {
				this.warn(`任务 ${task.id}「${task.title}」定时执行失败：${String(error)}`);
			}).finally(() => {
				this.dispatching.delete(task.id);
			});
		}
	}
	/** 全部任务的已错过槽点（每条任务至多一条：最近一个）。 */
	collectMissed() {
		const now = Date.now();
		const missed = [];
		for (const task of this.tasks) {
			if (!task.enabled) continue;
			const slot = detectMissed(task.schedule, now, task.lastRunAt, task.createdAt);
			if (slot !== void 0) missed.push({
				taskId: task.id,
				slotTime: slot
			});
		}
		return missed;
	}
	/**
	* 执行一次任务：先落基准与「running」记录（防重复触发的关键一步），再按任务类型分流。
	* @returns 关联的会话 id（assistant=数字助理会话；command=undefined）。失败时抛错，记录置 failed。
	*/
	async dispatch(task, trigger) {
		const now = Date.now();
		const record = {
			id: `run-${randomUUID().slice(0, 8)}`,
			taskId: task.id,
			trigger: trigger.kind,
			startedAt: now,
			status: "running"
		};
		this.patchTask(task.id, {
			lastRunAt: trigger.kind === "schedule" ? trigger.slot ?? now : now,
			lastStatus: "running",
			lastError: void 0
		});
		this.records.push(record);
		if (this.records.length > MAX_RECORDS) this.records.splice(0, this.records.length - MAX_RECORDS);
		this.save();
		try {
			const sessionId = task.executor === "command" ? await this.runCommand(task, record) : await this.handToAssistant(task, record);
			if (sessionId !== void 0) this.patchTask(task.id, { lastSessionId: sessionId });
			this.save();
			console.log(`[dsh-todo-scheduler] 任务 ${task.id}「${task.title}」已执行（${task.executor}，${TRIGGER_LABELS[trigger.kind]}）`);
			return sessionId;
		} catch (error) {
			this.replaceRecord(record.id, {
				status: "failed",
				error: String(error)
			});
			this.patchTask(task.id, {
				lastStatus: "failed",
				lastError: String(error)
			});
			this.save();
			throw error;
		}
	}
	/**
	* AI 任务：转交给数字助理。ensure() 保证主对话在场，再把描述以用户消息投给它；
	* 派发/汇报是数字助理的职责，这里落「已转交」即完成。
	*/
	async handToAssistant(task, record) {
		const gateway = this.assistantGateway;
		if (gateway === void 0) throw new Error("数字助理不可用（dsh-digital-assistant 模组未启用）；AI 任务需要它来执行。");
		const { sessionId } = await gateway.ensure();
		const agent = this.agents.get(sessionId);
		if (agent === void 0) throw new Error(`数字助理会话 ${sessionId} 不在线，无法投递任务。`);
		agent.followup(createUserMessage({
			content: [{
				type: "text",
				text: `【待办任务派发｜${TRIGGER_LABELS[record.trigger]}】\n任务：${task.title}\n\n${task.description}`
			}],
			source: { kind: "user" }
		}));
		const summary = `已转交数字助理（会话 ${sessionId}），由它安排执行并在完成后汇报结果。`;
		this.replaceRecord(record.id, {
			status: "ok",
			sessionId,
			summary
		});
		this.patchTask(task.id, { lastStatus: "ok" });
		return sessionId;
	}
	/**
	* 程序任务：官方 subprocess 直接运行（显式 argv、不过 shell、上限输出、超时中止）。
	* @returns undefined（没有会话；结果在记录里）。
	*/
	async runCommand(task, record) {
		const subprocess = this.subprocess;
		if (subprocess === void 0) throw new Error("subprocess 服务不可用，无法运行命令。");
		const command = task.command;
		if (command === void 0) throw new Error("这条任务缺少命令配置，编辑后重试。");
		const workspace = this.registry.get(task.target.workspaceId);
		if (workspace === void 0) throw new Error(`找不到工作目录 ${JSON.stringify(task.target.workspaceId)}（它可能被删除了，编辑任务换一个）`);
		const argv = [command.command.trim(), ...command.args.trim().split(/\s+/u).filter((part) => part !== "")];
		const controller = new AbortController();
		const timer = setTimeout(() => {
			controller.abort(/* @__PURE__ */ new Error(`命令超过 ${COMMAND_TIMEOUT_MS / 6e4} 分钟被中止`));
		}, COMMAND_TIMEOUT_MS);
		try {
			const handle = subprocess.spawn({
				argv,
				cwd: workspace.path,
				stdio: {
					stdin: "ignore",
					stdout: { maxBytes: COMMAND_STDOUT_BYTES },
					stderr: { maxBytes: COMMAND_STDERR_BYTES }
				},
				graceMs: COMMAND_GRACE_MS,
				signal: controller.signal
			});
			const outcome = await handle.waitForExit();
			const stdout = handle.collected.stdout?.readFrom(0).text ?? "";
			const stderr = handle.collected.stderr?.readFrom(0).text ?? "";
			if (outcome.exitCode === 0) {
				const summary = [
					`命令完成（退出码 0）`,
					`$ ${argv.join(" ")}`,
					stdout === "" ? "" : `[stdout]\n${clip(stdout, 800)}`,
					stderr === "" ? "" : `[stderr]\n${clip(stderr, 300)}`
				].filter((part) => part !== "").join("\n");
				this.replaceRecord(record.id, {
					status: "ok",
					summary
				});
				this.patchTask(task.id, { lastStatus: "ok" });
			} else {
				const cause = outcome.signal !== null ? `被信号 ${outcome.signal} 终止` : `退出码 ${outcome.exitCode ?? "未知"}`;
				this.replaceRecord(record.id, {
					status: "failed",
					error: `命令失败（${cause}）：${clip(stderr === "" ? stdout : stderr, 400)}`
				});
				this.patchTask(task.id, {
					lastStatus: "failed",
					lastError: `命令失败（${cause}）`
				});
			}
			return;
		} finally {
			clearTimeout(timer);
		}
	}
	/** 原子写盘：同目录临时文件 + rename。 */
	save() {
		const data = {
			version: 2,
			tasks: this.tasks,
			records: this.records.slice(-200)
		};
		try {
			mkdirSync(dirname(this.dataFile), { recursive: true });
			const tmp = `${this.dataFile}.tmp-${process.pid}`;
			writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
			renameSync(tmp, this.dataFile);
		} catch (error) {
			this.warn(`保存任务数据失败：${String(error)}`);
		}
	}
	/** 就地更新一条任务（不落盘；调用方负责 save）。 */
	patchTask(id, patch) {
		const index = this.tasks.findIndex((item) => item.id === id);
		if (index === -1) return;
		this.tasks[index] = {
			...this.tasks[index],
			...patch
		};
	}
	/** 就地更新一条执行记录（不落盘；调用方负责 save）。 */
	replaceRecord(id, patch) {
		const index = this.records.findIndex((item) => item.id === id);
		if (index === -1) return;
		this.records[index] = {
			...this.records[index],
			...patch
		};
	}
	/** 任务的展示视图（附下次执行时间；停用或不自动执行的没有）。 */
	toView(task, now) {
		if (!task.enabled) return task;
		const nextRunAt = computeNextRunAt(task.schedule, now, task.lastRunAt);
		return nextRunAt === void 0 ? task : {
			...task,
			nextRunAt
		};
	}
	/** 统一的告警出口（模组不静默吞错）。 */
	warn(message) {
		try {
			console.warn(`[dsh-todo-scheduler] ${message}`);
		} catch {}
	}
};
Object.defineProperty(JxTodoGateway.prototype, "@deepseek-ai/dsh-typert-protocol/remote-methods", {
	configurable: true,
	value: Object.freeze({
		version: 1,
		methods: Object.freeze([
			{
				method: "status",
				invocation: Object.freeze({ kind: "direct" })
			},
			{
				method: "listTasks",
				invocation: Object.freeze({ kind: "direct" })
			},
			{
				method: "createTask",
				invocation: Object.freeze({ kind: "direct" })
			},
			{
				method: "updateTask",
				invocation: Object.freeze({ kind: "direct" })
			},
			{
				method: "deleteTask",
				invocation: Object.freeze({ kind: "direct" })
			},
			{
				method: "runNow",
				invocation: Object.freeze({ kind: "direct" })
			},
			{
				method: "resolveMissed",
				invocation: Object.freeze({ kind: "direct" })
			},
			{
				method: "listWorkspaces",
				invocation: Object.freeze({ kind: "direct" })
			}
		])
	})
});
//#endregion
export { JxTodoGateway, JxTodoGateway as default, TODO_DATA_FILE, name };
