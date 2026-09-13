import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
//#region src/plans.ts
/**
* 计划扫描与落盘（宿主侧纯逻辑）。
* 事件契约（已核实）：tool/call = {turn,step,callId,name,arguments(JSON字符串)}，
* tool/result = {turn,step,message:{callId,content,isError}}——按 callId 配对。
* 状态：isError=false → approved；isError=true → rejected；无 result → pending。
*/
/** 解析 DSH home（与官方 resolveDshHome 同规则）。 */
function resolveDshHome() {
	const fromEnv = process.env.DSH_HOME;
	return resolve(fromEnv !== void 0 && fromEnv.trim().length > 0 ? fromEnv : join(homedir(), ".dsh"));
}
/** 计划落盘目录。 */
function plansDir() {
	return join(resolveDshHome(), "plans");
}
/** 文件名安全字符。 */
function slugify(title) {
	const kept = (title.split("\n")[0]?.replace(/^#\s*/, "").trim() ?? "").replace(/[\\/:*?"<>|\r\n\t]/g, " ").replace(/\s+/g, "-").slice(0, 40);
	return kept === "" ? "plan" : kept;
}
function frontmatter(sessionId, record) {
	return [
		"---",
		`session: ${sessionId}`,
		`seq: ${record.seq}`,
		`status: ${record.status}`,
		`presentedAt: ${new Date(record.time).toISOString()}`,
		"---",
		""
	].join("\n");
}
/** 目录内已有文件的索引：`session/seq` → 文件路径（按 frontmatter 识别）。 */
function existingIndex(dir) {
	const index = /* @__PURE__ */ new Map();
	if (!existsSync(dir)) return index;
	for (const name of readdirSync(dir)) {
		if (!name.endsWith(".md")) continue;
		const path = join(dir, name);
		let head = "";
		try {
			head = readFileSync(path, "utf8").split("---").slice(0, 3)[1] ?? "";
		} catch {
			continue;
		}
		const session = /^session:\s*(.*)$/m.exec(head)?.[1]?.trim() ?? "";
		const seq = /^seq:\s*(\d+)/m.exec(head)?.[1];
		const status = /^status:\s*(\S+)/m.exec(head)?.[1] ?? "";
		if (seq !== void 0 && session !== "") index.set(`${session}/${seq}`, {
			path,
			status
		});
	}
	return index;
}
/**
* 扫描一个会话的计划并同步落盘（幂等：已有文件只更新状态，缺失则创建）。
* @returns 计划清单，最新在前。
*/
function collectPlans(sessionId, events) {
	const dir = plansDir();
	const index = existingIndex(dir);
	const calls = [];
	const results = /* @__PURE__ */ new Map();
	for (const event of events) {
		const data = event.data;
		if (event.type === "tool/call" && data !== void 0) {
			if (data.name !== "exit_plan_mode" || typeof data.arguments !== "string") continue;
			let plan;
			try {
				plan = JSON.parse(data.arguments).plan;
			} catch {
				continue;
			}
			if (typeof plan !== "string" || plan.trim() === "") continue;
			calls.push({
				seq: typeof event.seq === "number" ? event.seq : 0,
				time: typeof event.time === "number" ? event.time : 0,
				callId: String(data.callId ?? ""),
				plan
			});
		} else if (event.type === "tool/result" && data !== void 0) {
			const message = data.message;
			if (message === void 0 || message.callId === void 0) continue;
			if (!calls.some((call) => call.callId === String(message.callId))) continue;
			results.set(String(message.callId), message.isError === true);
		}
	}
	mkdirSync(dir, { recursive: true });
	const records = [];
	for (const call of [...calls].reverse()) {
		const isError = results.get(call.callId);
		const status = isError === void 0 ? "pending" : isError ? "rejected" : "approved";
		const key = `${sessionId}/${call.seq}`;
		const existing = index.get(key);
		let file;
		if (existing !== void 0) {
			file = existing.path;
			if (existing.status !== status) rewriteStatus(file, status);
		} else {
			const stamp = new Date(call.time);
			file = join(dir, `${Number.isNaN(stamp.getTime()) ? "unknown" : stamp.toISOString().slice(0, 16).replace("T", "-").replace(/:/g, "")}-${slugify(call.plan)}.md`);
			writeFileSync(file, `${frontmatter(sessionId, {
				seq: call.seq,
				time: call.time,
				status
			})}${call.plan}\n`, "utf8");
		}
		records.push({
			seq: call.seq,
			time: call.time,
			plan: call.plan,
			status,
			file
		});
	}
	return records;
}
/** 只重写文件头的 status 行（正文原样保留）。 */
function rewriteStatus(path, status) {
	try {
		const content = readFileSync(path, "utf8");
		const updated = content.replace(/^(---[\s\S]*?^status:\s*)\S+/m, `$1${status}`);
		if (updated !== content) writeFileSync(path, updated, "utf8");
	} catch {}
}
//#endregion
//#region src/index.ts
var JxPlansGateway = class extends TypertRemoteService {
	static inject = ["sessionQuery"];
	constructor(ctx) {
		super(ctx, "jxPlans");
	}
	/** 本会话的计划清单（最新在前），并幂等同步 dsh-home\plans\ 落盘文件。 */
	async list(sessionId) {
		const sessionQuery = this.ctx.sessionQuery;
		let events;
		try {
			events = (await sessionQuery.readSession(sessionId)).events;
		} catch {
			return { plans: [] };
		}
		return { plans: collectPlans(sessionId, events) };
	}
};
Object.defineProperty(JxPlansGateway.prototype, "@deepseek-ai/dsh-typert-protocol/remote-methods", {
	configurable: true,
	value: Object.freeze({
		version: 1,
		methods: Object.freeze([{
			method: "list",
			invocation: Object.freeze({ kind: "direct" })
		}])
	})
});
//#endregion
export { JxPlansGateway, JxPlansGateway as default };
