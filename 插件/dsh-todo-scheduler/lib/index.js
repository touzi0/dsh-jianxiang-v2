import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { defineTool } from "@deepseek-ai/dsh-tools";
/** 解析 `HH:mm` 为当天分钟数；格式不对返回 undefined。 */
function parseTimeToMinutes$1(time) {
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
	const parsed = parseTimeToMinutes$1("time" in schedule ? schedule.time : "");
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
//#region src/tools.ts
/**
* 面向模型的待办/定时任务工具（全局层，注册进 `ctx.tools`，所有会话可见，
* 官方注册方式与 `packages/todo/tool-todo`（`todo_write`）同一条正道）。
*
* 工具集（增删改查 + 立即执行 + 工作区枚举）：
* - todo_task_list / todo_task_get：查看
* - todo_task_create / todo_task_update / todo_task_delete：增/改/删
* - todo_task_run：立即执行一次（delete 与 run 走官方审批，不绕过）
* - todo_workspace_list：程序任务要选工作目录，模型先看有哪些
*
* schedule 是明确的结构化参数（三种形态见 SCHEDULE_PARAM），不收自由字符串；
* 返回值一律含任务 id 与人类可读确认，便于多轮操作。
*/
/** 内容块 helper：工具输出一律纯文本。 */
function textBlock(text) {
	return [{
		type: "text",
		text
	}];
}
const TEXT_OUTPUT = {
	type: "object",
	additionalProperties: false,
	properties: { text: {
		type: "string",
		required: true
	} }
};
/** 时刻 “HH:mm” → 当天分钟数（校验用，复用宿主同一规则）。 */
function parseTimeToMinutes(time) {
	const match = /^(\d{1,2}):(\d{2})$/u.exec(time.trim());
	if (match === null) return void 0;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return void 0;
	return hours * 60 + minutes;
}
/**
* “YYYY-MM-DD HH:mm”（本地时区）→ epoch 毫秒。也接受可被 Date.parse 的
* ISO 形式做兜底，但推荐明确格式。
*/
function parseLocalDateTime(text) {
	const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/u.exec(text.trim());
	if (match !== null) {
		const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
		return Number.isNaN(date.getTime()) ? void 0 : date.getTime();
	}
	const parsed = Date.parse(text.trim());
	return Number.isNaN(parsed) ? void 0 : parsed;
}
/** 工具参数里的 schedule（模型友好形状）→ 宿主 Schedule；不合法抛人话错误。 */
function toSchedule(raw) {
	const kind = raw.kind;
	switch (kind) {
		case "manual": return { kind: "manual" };
		case "once": {
			if (typeof raw.at !== "string") throw new Error("定时一次需要 at（“YYYY-MM-DD HH:mm”，本地时区）");
			const at = parseLocalDateTime(raw.at);
			if (at === void 0) throw new Error(`at 无法解析：${JSON.stringify(raw.at)}，请用 “YYYY-MM-DD HH:mm” 格式`);
			return {
				kind: "once",
				at
			};
		}
		case "daily":
		case "weekdays":
			if (typeof raw.time !== "string" || parseTimeToMinutes(raw.time) === void 0) throw new Error("每天/仅工作日需要 time（“HH:mm”）");
			return {
				kind,
				time: raw.time.trim()
			};
		case "weekly":
			if (typeof raw.time !== "string" || parseTimeToMinutes(raw.time) === void 0) throw new Error("每周执行需要 time（“HH:mm”）");
			if (!Array.isArray(raw.days) || raw.days.length === 0 || raw.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error("每周执行需要 days（非空数组，0=周日 … 6=周六）");
			return {
				kind: "weekly",
				days: raw.days,
				time: raw.time.trim()
			};
		case "interval": {
			const minutes = raw.every_minutes;
			if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 1 || minutes > 43200) throw new Error("循环间隔需要 every_minutes（1 到 43200 的整数分钟）");
			return {
				kind: "interval",
				everyMinutes: minutes
			};
		}
		default: throw new Error("schedule.kind 必须是 manual / once / daily / weekly / weekdays / interval 之一");
	}
}
/** 工具参数里的命令（模型友好形状）→ 宿主 CommandSpec。 */
function toCommand(raw) {
	if (raw === void 0) return void 0;
	if (typeof raw.command !== "string" || raw.command.trim() === "") throw new Error("command.command 必须是非空字符串（要运行的程序）");
	return {
		command: raw.command,
		args: typeof raw.args === "string" ? raw.args : ""
	};
}
/** 执行方式的中文标签（给模型的确认文本用）。 */
function describeSchedule(schedule) {
	switch (schedule.kind) {
		case "manual": return "不定时（只记录，不自动执行）";
		case "once": return `定时一次（${new Date(schedule.at).toLocaleString("zh-CN")}）`;
		case "daily": return `每天 ${schedule.time}`;
		case "weekly": return `每周${schedule.days.map((day) => "日一二三四五六"[day] ?? String(day)).join("、")} ${schedule.time}`;
		case "weekdays": return `工作日每天 ${schedule.time}`;
		case "interval": return `每隔 ${schedule.everyMinutes} 分钟`;
	}
}
function describeExecutor(task) {
	if (task.executor === "command") {
		const command = task.command;
		return `程序任务（$ ${command === void 0 ? "?" : `${command.command} ${command.args}`.trim()}）`;
	}
	return "AI 任务（到点转交数字助理执行）";
}
function formatTime(value) {
	if (value === void 0 || !Number.isFinite(value)) return "无";
	return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
/** 一条任务的清单行（列表工具用）。 */
function taskLine(task) {
	const next = task.nextRunAt !== void 0 ? `｜下次 ${formatTime(task.nextRunAt)}` : "";
	const status = task.lastStatus === void 0 ? "" : `｜上次 ${task.lastStatus === "ok" ? "成功" : task.lastStatus === "failed" ? "失败" : "运行中"}`;
	return `- ${task.title}｜id=${task.id}｜${describeSchedule(task.schedule)}｜${describeExecutor(task)}｜${task.enabled ? "启用" : "停用"}${next}${status}`;
}
/** 单条任务的详情文本。 */
function taskDetail(task, records) {
	const mine = records.filter((record) => record.taskId === task.id).slice(0, 5);
	return [
		`任务：${task.title}`,
		`id：${task.id}`,
		`执行方式：${describeSchedule(task.schedule)}`,
		`类型：${describeExecutor(task)}`,
		`状态：${task.enabled ? "启用" : "停用"}${task.lastStatus === void 0 ? "" : `｜上次执行 ${task.lastStatus === "ok" ? "成功" : task.lastStatus === "failed" ? "失败" : "运行中"}`}`,
		`下次执行：${task.nextRunAt !== void 0 ? formatTime(task.nextRunAt) : "不自动执行"}`,
		task.lastError === void 0 ? "" : `上次错误：${task.lastError}`,
		"",
		"描述：",
		task.description,
		"",
		mine.length === 0 ? "（还没有执行记录）" : `最近执行记录（最多 5 条）：\n${mine.map((record) => `- ${formatTime(record.startedAt)}｜${record.trigger === "schedule" ? "定时" : record.trigger === "manual" ? "手动" : "补跑"}｜${record.status === "ok" ? "成功" : record.status === "failed" ? "失败" : "运行中"}${record.summary === void 0 ? "" : `｜${record.summary}`}`).join("\n")}`
	].filter((line) => line !== "").join("\n");
}
/** 最近执行记录摘要（列表工具附带）。 */
function recentRecordsText(snapshot) {
	const records = snapshot.records.slice(0, 5);
	if (records.length === 0) return "";
	return `\n\n最近执行记录（最多 5 条）：\n${records.map((record) => {
		const task = snapshot.tasks.find((item) => item.id === record.taskId);
		return `- ${formatTime(record.startedAt)}｜${task?.title ?? record.taskId}｜${record.status === "ok" ? "成功" : record.status === "failed" ? "失败" : "运行中"}`;
	}).join("\n")}`;
}
/** schedule 参数的统一 schema 片段（create 与 update 共用）。 */
const SCHEDULE_PARAM = {
	type: "object",
	additionalProperties: false,
	properties: {
		kind: {
			type: "string",
			required: true,
			enum: [
				"manual",
				"once",
				"daily",
				"weekly",
				"weekdays",
				"interval"
			],
			description: "执行方式：manual=不定时（只记录，不自动执行）；once=定时一次；daily=每天；weekly=每周某几天；weekdays=仅工作日每天；interval=每隔 N 分钟。"
		},
		at: {
			type: "string",
			description: "仅 kind=once：执行时刻，格式 “YYYY-MM-DD HH:mm”（本地时区）。"
		},
		time: {
			type: "string",
			description: "仅 kind=daily/weekly/weekdays：当天执行时刻，格式 “HH:mm”（如 “21:00”）。"
		},
		days: {
			type: "array",
			items: { type: "number" },
			description: "仅 kind=weekly：星期几的数组，0=周日、1=周一 … 6=周六（至少一个）。"
		},
		every_minutes: {
			type: "number",
			description: "仅 kind=interval：间隔分钟数（1–43200 的整数）。"
		}
	}
};
const COMMAND_PARAM = {
	type: "object",
	additionalProperties: false,
	properties: {
		command: {
			type: "string",
			required: true,
			description: "要运行的程序（如 “node”、“pwsh”）。"
		},
		args: {
			type: "string",
			description: "参数，用空格分隔（不支持引号包空格；复杂需求写个小脚本再运行它）。"
		}
	}
};
/**
* 构造全部待办工具定义（宿主在插件加载时注册进全局 `ctx.tools`）。
* @param gateway - 待办网关（公开 CRUD 方法）。
* @param ask - 审批回调（delete/run 用，接官方 approval 服务）。
* @returns defineTool 定义数组。
*/
function buildTodoTools(gateway, ask) {
	return [
		defineTool({
			name: "todo_task_list",
			description: "列出用户的全部待办事项与定时任务：每条含 id、标题、执行方式（不定时/定时一次/每天/每周/工作日/间隔）、类型（AI 任务/程序任务）、启用状态、下次执行时间与上次执行结果，另附最近 5 条执行记录。用户提到“待办”“任务清单”“定时任务”时先用这个看全貌；后续增删改都要用这里返回的 id。",
			parameters: {},
			output: {
				schema: TEXT_OUTPUT,
				render: (_args, value) => textBlock(value.text)
			},
			execute: async () => {
				const snapshot = await gateway.listTasks();
				if (snapshot.tasks.length === 0) return { text: "（待办清单是空的）" };
				return { text: `共 ${snapshot.tasks.length} 条任务：\n${snapshot.tasks.map(taskLine).join("\n")}${recentRecordsText(snapshot)}` };
			}
		}),
		defineTool({
			name: "todo_task_get",
			description: "按 id 查看一条待办/定时任务的完整详情：描述原文、执行方式、类型、启用状态、下次执行时间与最近执行记录。",
			parameters: { task_id: {
				type: "string",
				required: true,
				description: "任务 id（来自 todo_task_list）。"
			} },
			output: {
				schema: TEXT_OUTPUT,
				render: (_args, value) => textBlock(value.text)
			},
			execute: async (args) => {
				const id = typeof args.task_id === "string" ? args.task_id.trim() : "";
				if (id === "") return { text: "需要 task_id（来自 todo_task_list）。" };
				const snapshot = await gateway.listTasks();
				const task = snapshot.tasks.find((item) => item.id === id);
				if (task === void 0) return { text: `找不到任务 ${JSON.stringify(id)}；用 todo_task_list 看现有 id。` };
				return { text: taskDetail(task, snapshot.records) };
			}
		}),
		defineTool({
			name: "todo_task_create",
			description: "新建一条待办事项或定时任务。三种执行方式都支持：不定时（只记录）、定时一次（at 指定日期时间）、循环定时（每天/每周某几天/仅工作日 + time 时刻，或每隔 N 分钟）。任务分两类：executor=\"assistant\"（AI 任务，到点把描述转交数字助理执行，用户让“记个待办/提醒我几点做某事”用这类）与 executor=\"command\"（程序任务，到点在指定工作目录直接运行命令，需同时给 command 与 workspace_id）。描述要写成自足的一段话（将来会原样派出去执行）。",
			parameters: {
				title: {
					type: "string",
					required: true,
					description: "任务标题（简短一行）。"
				},
				description: {
					type: "string",
					required: true,
					description: "任务描述：将来原样派发执行的完整需求，自足、不依赖聊天上下文。"
				},
				schedule: SCHEDULE_PARAM,
				executor: {
					type: "string",
					enum: ["assistant", "command"],
					description: "任务类型：assistant=AI 任务（默认，转交数字助理）；command=程序任务（到点运行命令）。"
				},
				command: COMMAND_PARAM,
				workspace_id: {
					type: "string",
					description: "仅程序任务：工作目录的工作区 id（先用 todo_workspace_list 查）。"
				},
				enabled: {
					type: "boolean",
					description: "是否启用，默认 true。"
				}
			},
			output: {
				schema: TEXT_OUTPUT,
				render: (_args, value) => textBlock(value.text)
			},
			execute: async (args) => {
				try {
					const schedule = toSchedule(args.schedule ?? {});
					const executor = args.executor === "command" ? "command" : "assistant";
					const task = (await gateway.createTask({
						title: typeof args.title === "string" ? args.title : "",
						description: typeof args.description === "string" ? args.description : "",
						executor,
						schedule,
						target: { workspaceId: executor === "command" ? typeof args.workspace_id === "string" ? args.workspace_id : "" : "" },
						...executor === "command" ? { command: toCommand(args.command) } : {},
						...args.enabled !== void 0 ? { enabled: args.enabled === true } : {}
					})).task;
					return { text: `已新建任务「${task.title}」（id=${task.id}）｜${describeSchedule(task.schedule)}｜${describeExecutor(task)}｜${task.enabled ? "启用" : "停用"}。页面「待办事项与定时任务」里立即可见；后续用这个 id 修改/删除/立即执行。` };
				} catch (error) {
					return { text: `新建失败：${String(error)}` };
				}
			}
		}),
		defineTool({
			name: "todo_task_update",
			description: "修改一条待办/定时任务：只传要改的字段（未传的保持不变）。可改标题、描述、执行方式（schedule 结构与新建相同）、任务类型（executor/command/workspace_id 需配套）、启用状态。",
			parameters: {
				task_id: {
					type: "string",
					required: true,
					description: "任务 id（来自 todo_task_list）。"
				},
				title: { type: "string" },
				description: {
					type: "string",
					description: "新的任务描述（整体替换）。"
				},
				schedule: SCHEDULE_PARAM,
				executor: {
					type: "string",
					enum: ["assistant", "command"]
				},
				command: COMMAND_PARAM,
				workspace_id: {
					type: "string",
					description: "仅程序任务：工作目录的工作区 id。"
				},
				enabled: {
					type: "boolean",
					description: "启用/停用。"
				}
			},
			output: {
				schema: TEXT_OUTPUT,
				render: (_args, value) => textBlock(value.text)
			},
			execute: async (args) => {
				const id = typeof args.task_id === "string" ? args.task_id.trim() : "";
				if (id === "") return { text: "需要 task_id（来自 todo_task_list）。" };
				const current = (await gateway.listTasks()).tasks.find((item) => item.id === id);
				if (current === void 0) return { text: `找不到任务 ${JSON.stringify(id)}；用 todo_task_list 看现有 id。` };
				try {
					const patch = {};
					if (args.title !== void 0) patch.title = args.title;
					if (args.description !== void 0) patch.description = args.description;
					if (args.schedule !== void 0) patch.schedule = toSchedule(args.schedule);
					if (args.enabled !== void 0) patch.enabled = args.enabled === true;
					if (args.executor !== void 0 || args.command !== void 0 || args.workspace_id !== void 0) {
						patch.executor = args.executor === "command" ? "command" : args.executor === "assistant" ? "assistant" : current.executor;
						patch.target = { workspaceId: args.workspace_id !== void 0 ? args.workspace_id : current.target.workspaceId };
						patch.command = args.command !== void 0 ? toCommand(args.command) : current.command;
					}
					const task = (await gateway.updateTask({
						id,
						patch
					})).task;
					return { text: `已更新任务「${task.title}」（id=${task.id}）｜${describeSchedule(task.schedule)}｜${describeExecutor(task)}｜${task.enabled ? "启用" : "停用"}。` };
				} catch (error) {
					return { text: `更新失败：${String(error)}` };
				}
			}
		}),
		defineTool({
			name: "todo_task_delete",
			description: "按 id 删除一条待办/定时任务（不可恢复；历史执行记录保留）。删除前会请求用户审批。",
			parameters: { task_id: {
				type: "string",
				required: true,
				description: "任务 id（来自 todo_task_list）。"
			} },
			output: {
				schema: TEXT_OUTPUT,
				render: (_args, value) => textBlock(value.text)
			},
			execute: async (args, exec) => {
				const id = typeof args.task_id === "string" ? args.task_id.trim() : "";
				if (id === "") return { text: "需要 task_id（来自 todo_task_list）。" };
				const task = (await gateway.listTasks()).tasks.find((item) => item.id === id);
				if (task === void 0) return { text: `找不到任务 ${JSON.stringify(id)}；用 todo_task_list 看现有 id。` };
				if (!await ask(exec, `删除待办任务「${task.title}」（${describeSchedule(task.schedule)}）。删除后不可恢复。`)) return { text: `用户没有批准删除「${task.title}」。任务保持原样。` };
				try {
					await gateway.deleteTask({ id });
					return { text: `已删除任务「${task.title}」（id=${id}）。` };
				} catch (error) {
					return { text: `删除失败：${String(error)}` };
				}
			}
		}),
		defineTool({
			name: "todo_task_run",
			description: "立即执行一条待办/定时任务（不等它的定时点）：AI 任务立刻转交数字助理，程序任务立刻运行命令。执行前会请求用户审批。想验证任务配置或用户说“现在就跑”时用。",
			parameters: { task_id: {
				type: "string",
				required: true,
				description: "任务 id（来自 todo_task_list）。"
			} },
			output: {
				schema: TEXT_OUTPUT,
				render: (_args, value) => textBlock(value.text)
			},
			execute: async (args, exec) => {
				const id = typeof args.task_id === "string" ? args.task_id.trim() : "";
				if (id === "") return { text: "需要 task_id（来自 todo_task_list）。" };
				const task = (await gateway.listTasks()).tasks.find((item) => item.id === id);
				if (task === void 0) return { text: `找不到任务 ${JSON.stringify(id)}；用 todo_task_list 看现有 id。` };
				if (!await ask(exec, `立即执行待办任务「${task.title}」（${describeSchedule(task.schedule)}，${describeExecutor(task)}）。`)) return { text: `用户没有批准立即执行「${task.title}」。任务保持原样。` };
				try {
					const result = await gateway.runNow({ id });
					if (result.ok) return { text: `已执行任务「${task.title}」（id=${id}）：${task.executor === "command" ? "命令已运行，结果见执行记录（todo_task_get 可查）" : `已转交数字助理（会话 ${result.sessionId ?? "未知"}）`}。` };
					return { text: `执行失败：${result.error ?? "未知错误"}` };
				} catch (error) {
					return { text: `执行失败：${String(error)}` };
				}
			}
		}),
		defineTool({
			name: "todo_workspace_list",
			description: "列出可选的工作区（id、名称、路径）。新建/修改**程序任务**时要选工作目录（workspace_id），先来这里查。",
			parameters: {},
			output: {
				schema: TEXT_OUTPUT,
				render: (_args, value) => textBlock(value.text)
			},
			execute: async () => {
				const { items } = await gateway.listWorkspaces();
				if (items.length === 0) return { text: "（还没有登记过工作区；程序任务需要先在界面上建立工作区。）" };
				return { text: items.map((item) => `- ${item.title}｜id=${item.id}｜路径=${item.path}`).join("\n") };
			}
		})
	];
}
Object.freeze([
	"todo_task_list",
	"todo_task_get",
	"todo_task_create",
	"todo_task_update",
	"todo_task_delete",
	"todo_task_run",
	"todo_workspace_list"
]);
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
/** 首启示例任务（不定时，只记着不自动执行）：演示「立即执行 → 转交数字助理」，本身不干任何实事。 */
function makeSampleTask() {
	const now = Date.now();
	return {
		id: "task-sample-dispatch",
		title: "示例任务：点「立即执行」看看它怎么转交给数字助理",
		description: [
			"这是一条示例待办，本身没有任何实际工作要做，只用来演示效果：",
			"",
			"- 它是不定时任务，不会自己触发；",
			"- 点右侧「立即执行」，任务描述会原样转交给数字助理，数字助理那边像收到一条新消息一样开始处理；",
			"- 想看定时/循环定时的效果，可以编辑它把执行方式改成「每天 21:00」之类，或者直接新建一条。",
			"",
			"（给数字助理的说明：收到本条时不要执行任何实际操作、不要读写文件、不要派人干活，只回一句「示例任务已收到，转交链路正常」即可。看完可以删掉这条示例。）"
		].join("\n"),
		enabled: true,
		executor: "assistant",
		schedule: { kind: "manual" },
		target: { workspaceId: "" },
		createdAt: now,
		updatedAt: now
	};
}
/** 首启种子数据：只有一条示例任务；已有数据不会被改动，也不会被补种。 */
function seedData() {
	return {
		version: 2,
		tasks: [makeSampleTask()],
		records: []
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
/** 从磁盘读数据；文件不存在返回种子；文件损坏则把坏文件改名保留并返回种子；已有数据保持原样（不补种）。 */
function loadData(file) {
	if (!existsSync(file)) return seedData();
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8"));
		if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.records)) throw new Error("数据文件形状不对（version/tasks/records）");
		if (parsed.version === 1) return migrateV1(parsed);
		if (parsed.version !== 2) throw new Error(`数据文件版本不支持：${String(parsed.version)}`);
		return parsed;
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
			if (parseTimeToMinutes$1(schedule.time) === void 0) throw new Error(`时刻必须是 HH:mm，收到 ${JSON.stringify(schedule.time)}`);
			return;
		case "weekly":
			if (parseTimeToMinutes$1(schedule.time) === void 0) throw new Error(`时刻必须是 HH:mm，收到 ${JSON.stringify(schedule.time)}`);
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
	static inject = [
		"agents",
		"workspaceRegistry",
		"tools"
	];
	/** 内部可变副本（持久化形状见 TodoData）。 */
	tasks;
	records;
	/** 在途执行（按任务 id），防同一任务并发/重复触发。 */
	dispatching = /* @__PURE__ */ new Set();
	/**
	* 本次进程内删除过的任务 id（墓碑）：save() 合并磁盘新增条目时跳过它们，
	* 否则「内存没有、磁盘还有」无法区分「刚删除」与「外部新增」，删除会被合并步骤复活。
	*/
	deletedIds = /* @__PURE__ */ new Set();
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
		this.ctx.effect(() => {
			const tools = this.ctx.tools;
			if (tools === void 0) {
				this.warn("tools 服务不可用，待办模型工具未注册（页面与调度不受影响）。");
				return () => void 0;
			}
			const disposers = buildTodoTools(this, (exec, reason) => this.askApproval(exec, reason)).map((definition) => tools.register(definition));
			console.log("[dsh-todo-scheduler] 已注册 7 个待办模型工具（todo_task_* / todo_workspace_list）");
			return () => {
				for (const dispose of disposers) dispose();
			};
		}, "dsh-todo-scheduler: model tools");
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
	get approval() {
		return this.ctx.get("approval");
	}
	/**
	* 待办工具的审批回调（delete / run 用，不绕过官方审批链）。
	* 有 agent 上下文但拿不到 approval 服务时**拒绝**（fail closed）；
	* 没有 agent 上下文（自测/诊断调用）无从审批，放行。
	*/
	async askApproval(exec, reason) {
		if (exec.agent === void 0) return true;
		const approval = this.approval;
		if (approval === void 0) {
			this.warn("approval 服务不可用，待办工具的删除/立即执行被拒绝（fail closed）。");
			return false;
		}
		try {
			return await approval.request({
				agent: exec.agent,
				toolName: exec.name,
				...exec.callId === void 0 ? {} : { callId: exec.callId },
				reason
			}) === "allowed-once";
		} catch (error) {
			this.warn(`审批请求失败（按拒绝处理）：${String(error)}`);
			return false;
		}
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
		this.deletedIds.add(request.id);
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
	/**
	* 写盘前合并磁盘上的外部改动：宿主内存里的清单可能落后于磁盘（用户/其他进程
	* 手工编辑过 tasks.json，例如直接加了一条任务）。内存不知道的任务/记录原样并入，
	* 避免一次常规落盘把外部新增的条目写丢；内存知道的条目以内存为准（页面与调度
	* 的在途状态不能被旧磁盘数据回滚）。
	*/
	mergeDiskAdditions() {
		if (!existsSync(this.dataFile)) return;
		let disk;
		try {
			disk = JSON.parse(readFileSync(this.dataFile, "utf8"));
		} catch {
			return;
		}
		if (!Array.isArray(disk.tasks)) return;
		const knownTasks = new Set(this.tasks.map((task) => task.id));
		for (const task of disk.tasks) {
			if (task === null || typeof task !== "object" || typeof task.id !== "string") continue;
			if (knownTasks.has(task.id)) continue;
			if (this.deletedIds.has(task.id)) continue;
			this.tasks.push(task.executor === void 0 ? {
				...task,
				executor: "assistant"
			} : task);
			console.log(`[dsh-todo-scheduler] 写盘前并入磁盘上外部新增的任务 ${task.id}`);
		}
		if (Array.isArray(disk.records)) {
			const knownRecords = new Set(this.records.map((record) => record.id));
			for (const record of disk.records) {
				if (record === null || typeof record !== "object" || typeof record.id !== "string") continue;
				if (knownRecords.has(record.id)) continue;
				this.records.push(record);
			}
		}
	}
	/** 原子写盘：同目录临时文件 + rename（写之前先并入磁盘上的外部新增条目）。 */
	save() {
		this.mergeDiskAdditions();
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
export { JxTodoGateway, JxTodoGateway as default, TODO_DATA_FILE, buildTodoTools, describeSchedule, name, toSchedule };
