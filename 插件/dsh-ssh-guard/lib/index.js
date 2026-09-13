import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";
import { deepFreeze } from "@deepseek-ai/dsh-util-values";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
//#region src/guard.ts
/** 远端载体：ssh / scp / rsync / sftp / sshpass（出现在命令位，非路径片段）。 */
const REMOTE_CARRIER = /(?:^|[\n;&|(]\s*|\bsudo\s+)(?:ssh|scp|rsync|sftp|sshpass)\b/;
/** 灾难级模式 → 类别 → 人话说明。 */
const CATASTROPHIC = [
	{
		re: /\bdd\b[^|;&\n]*\bof=/,
		zh: "用 dd 直接覆写磁盘/设备，目标设备上的全部数据会立即丢失，且无法用回收站恢复"
	},
	{
		re: /\bmkfs(?:\.\w+)?\b/,
		zh: "格式化磁盘分区，该分区全部数据将被清除且不可恢复"
	},
	{
		re: /\bwipefs\b/,
		zh: "擦除磁盘签名（wipefs），会使分区/文件系统不可访问"
	},
	{
		re: />\s*\/dev\/(?:sd|nvme|vd|hd|xvd|mmcblk)/,
		zh: "把输出直接重定向写入裸磁盘设备，会破坏该设备上的数据"
	},
	{
		re: /\brm\s+(?:-[a-zA-Z-]+\s+)*\/(?:\s|$|\*|;|&)/,
		zh: "对根目录 / 本身执行删除（rm 到根），会尝试删除整个文件系统"
	},
	{
		re: /\brm\s+(?:-[a-zA-Z-]+\s+)*\/\*/,
		zh: "对 /* 根下全部内容执行删除，等价于清空整个文件系统"
	},
	{
		re: /\brm\s+(?:-[a-zA-Z-]+\s+)*~(?:\/\*)?(?:\s|$|;|&)/,
		zh: "删除整个用户主目录（~），该账号的全部数据会被清掉"
	},
	{
		re: /\b(?:chmod|chown)\s+-[a-zA-Z]*R[a-zA-Z]*\b[^;|&\n]*\s+\/(?:\s|$)/,
		zh: "递归修改根目录权限，通常会让整个系统不可用"
	},
	{
		re: /\b(?:shutdown|reboot|halt|poweroff)\b/,
		zh: "直接关闭/重启远程服务器，未保存的状态会丢失"
	},
	{
		re: /\binit\s+[06]\b/,
		zh: "切换运行级别到关机/重启，服务器会停机"
	},
	{
		re: /\bdrop\s+(?:database|schema)\b/i,
		zh: "删除整个数据库/schema，其中全部数据立即消失且不走回收站"
	},
	{
		re: /\btruncate\s+table\b/i,
		zh: "清空数据库表（truncate），表内全部行立即消失"
	}
];
/** 远端载荷里“有删除/破坏意味”的提示（用于决定是否需要 AI 审查）。 */
const DESTRUCTIVE_HINT = /\brm\b|\bdrop\b|\btruncate\b|\bdd\b/i;
/** 远端命令是否含复杂结构（改写有风险，宁可放过）。 */
const UNSAFE_TO_REWRITE = /[|<&`$()]/;
/** 从 ssh 命令中提取远端载荷及其前缀（前缀含 ssh、选项与 host，用于重组整条命令）。 */
function extractSshPayload(command) {
	const quotedTail = command.match(/((?:^|[\s;&|(])ssh\s[^;\n]*?\s)("([^"\\]|\\.)*"|'([^'\\]|\\.)*')\s*$/);
	if (quotedTail !== null) return {
		prefix: quotedTail[1] ?? "",
		payload: stripQuotes(quotedTail[2] ?? "")
	};
	const bare = command.match(/((?:^|[\s;&|(])ssh\s+(?:-{1,2}[\w-]+(?:\s+(?:"[^"]*"|'[^']*'|[^\s"']+))?\s+)*((?:[\w.-]+@)?[\w.\[\]:-]+)\s)(.+)$/);
	if (bare !== null && bare[3] !== void 0) return {
		prefix: bare[1] ?? "",
		payload: stripQuotes(bare[3])
	};
}
function stripQuotes(text) {
	const t = text.trim();
	if (t.length >= 2 && (t.startsWith("\"") && t.endsWith("\"") || t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1).trim();
	return t;
}
/** 一段 rm 命令是否是「简单形状」：rm [标志] 路径...，无复杂结构。 */
function parseSimpleRm(segment) {
	const m = /^rm\s+(?:(-[a-zA-Z-]+)\s+)?(.+)$/s.exec(segment.trim());
	if (m === null) return void 0;
	const paths = m[2].trim().split(/\s+/).filter((path) => path.length > 0);
	if (paths.length === 0) return void 0;
	return {
		flags: m[1] ?? "",
		paths
	};
}
/** 生成回收站搬迁命令段（远端执行，~ 由远端 shell 展开）。 */
function trashSegment(paths, config) {
	const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
	const trash = config.trashDir.startsWith("~/") || config.trashDir.startsWith("~") ? config.trashDir : `~/${config.trashDir.replace(/^\//, "")}`;
	const prune = `find ${trash} -maxdepth 1 -mtime +${config.retentionDays} -exec rm -rf {} + 2>/dev/null || true`;
	return `mkdir -p ${trash}/${stamp} && mv -t ${trash}/${stamp} -- ${paths.join(" ")} ; ${prune}`;
}
function analyze(command, config) {
	if (!REMOTE_CARRIER.test(command)) return { kind: "pass" };
	const extracted = extractSshPayload(command);
	const scanText = extracted?.payload ?? command;
	for (const rule of CATASTROPHIC) if (rule.re.test(scanText)) return {
		kind: "catastrophic",
		reasonZh: rule.zh
	};
	if (extracted !== void 0 && /\brm\b/.test(extracted.payload) && !UNSAFE_TO_REWRITE.test(extracted.payload)) {
		const parsed = extracted.payload.split(/\s*(?:&&|;)\s*/).filter((segment) => segment.trim().length > 0).map((segment) => parseSimpleRm(segment));
		if (parsed.length > 0 && parsed.every((part) => part !== void 0)) {
			const newPayload = parsed.map((part) => trashSegment(part.paths, config)).join(" && ");
			return {
				kind: "rewrite",
				rewritten: `${extracted.prefix}"${newPayload}"`,
				note: `[jx-ssh-guard] 你的远端 rm 命令已被安全改写为「移入远端回收站 ${config.trashDir}」（保留 ${config.retentionDays} 天后自动清理）。目标路径已从原位置移除，效果与删除一致；若确实要立即彻底删除，可对回收站内路径执行 rm。`
			};
		}
	}
	if (DESTRUCTIVE_HINT.test(scanText)) return { kind: "reviewNeeded" };
	return { kind: "pass" };
}
//#endregion
//#region src/index.ts
const name = "dsh-ssh-guard";
const DEFAULT_CONFIG = {
	trashDir: "~/.jx-trash",
	retentionDays: 7,
	review: false,
	reviewProvider: "deepseek-official",
	reviewModel: "deepseek-chat"
};
var JxSshGuardGateway = class extends TypertRemoteService {
	static inject = ["llm"];
	/** 改写/审查后待标注的调用（callId → 给模型看的说明）。 */
	pendingNotes = /* @__PURE__ */ new Map();
	/** 记录文件路径（模组目录内 records.jsonl）。 */
	recordsFile;
	config;
	constructor(ctx, config = {}) {
		super(ctx, "jxSshGuard");
		this.config = {
			...DEFAULT_CONFIG,
			...config
		};
		this.recordsFile = join(dirname(fileURLToPath(import.meta.url)), "..", "records.jsonl");
		this.installHooks();
	}
	installHooks() {
		const pre = async (exec, next) => {
			try {
				if (exec.name !== "bash" && exec.name !== "pwsh") return await next();
				const command = typeof exec.arguments?.command === "string" ? exec.arguments.command : "";
				if (command === "") return await next();
				const verdict = analyze(command, this.config);
				if (verdict.kind === "pass") return await next();
				if (verdict.kind === "rewrite") {
					let rewrittenOk = false;
					try {
						exec.arguments = deepFreeze({
							...exec.arguments,
							command: verdict.rewritten
						});
						rewrittenOk = true;
					} catch {}
					if (rewrittenOk) {
						this.pendingNotes.set(exec.callId, verdict.note);
						this.record({
							action: "rewrite",
							tool: exec.name,
							session: exec.agent?.session.id ?? "",
							command,
							note: verdict.note,
							rewritten: verdict.rewritten
						});
						return await next();
					}
					this.record({
						action: "rewrite-fallback-ask",
						tool: exec.name,
						session: exec.agent?.session.id ?? "",
						command,
						note: verdict.note
					});
					return {
						kind: "ask",
						reason: `安全闸：远端删除命令需要确认。影响说明：${verdict.note}`
					};
				}
				if (verdict.kind === "catastrophic") {
					this.record({
						action: "ask-catastrophic",
						tool: exec.name,
						session: exec.agent?.session.id ?? "",
						command,
						note: verdict.reasonZh
					});
					return {
						kind: "ask",
						reason: `安全闸：${verdict.reasonZh}。如果这不是本次任务的明确意图，请拒绝。`
					};
				}
				if (!this.config.review) return await next();
				const review = await this.aiReview(exec, command);
				if (review === void 0) {
					this.record({
						action: "ai-error",
						tool: exec.name,
						session: exec.agent?.session.id ?? "",
						command,
						note: "审查调用失败，按放行处理"
					});
					return await next();
				}
				if (review.decision === "ask") {
					this.record({
						action: "ai-ask",
						tool: exec.name,
						session: exec.agent?.session.id ?? "",
						command,
						note: review.impact
					});
					return {
						kind: "ask",
						reason: `AI 安全审查建议确认：${review.impact}`
					};
				}
				this.record({
					action: "ai-allow",
					tool: exec.name,
					session: exec.agent?.session.id ?? "",
					command,
					note: review.impact
				});
				this.pendingNotes.set(exec.callId, `[jx-ssh-guard] AI 安全审查已通过（${review.impact}）。`);
				return await next();
			} catch {
				return await next();
			}
		};
		const post = async (exec, result, next) => {
			const accepted = await next();
			const note = this.pendingNotes.get(exec.callId);
			this.pendingNotes.delete(exec.callId);
			if (note === void 0) return accepted;
			try {
				return {
					kind: "accept",
					content: [...result.content ?? [], {
						type: "text",
						text: note
					}]
				};
			} catch {
				return accepted;
			}
		};
		this.ctx.on("tools/pre-execute", pre);
		this.ctx.on("tools/post-execute", post);
	}
	async aiReview(exec, command) {
		try {
			const llm = this.ctx.llm;
			if (llm === void 0) return void 0;
			const system = [
				"你是服务器命令安全审查员。用户代理正要在远程服务器上执行命令。",
				"判断它是否会造成「大规模、不可逆」的破坏（整盘/整库/整目录树删除、覆写设备、停机、波及无关数据）。",
				"普通的单文件删除、配置修改、服务重启、可恢复的操作一律判 allow。",
				"只输出一行严格 JSON：{\"decision\":\"allow\"或\"ask\",\"impact\":\"一句中文说明该命令的目的与最坏影响，给非技术用户看\"}"
			].join("\n");
			const message = createUserMessage({
				content: [{
					type: "text",
					text: command.slice(0, 4e3)
				}],
				source: {
					kind: "plugin",
					plugin: "dsh-ssh-guard"
				}
			});
			const options = deepFreeze({
				provider: this.config.reviewProvider,
				model: this.config.reviewModel,
				messages: [message],
				system,
				temperature: 0,
				maxTokens: 200,
				sessionId: exec.agent?.session.id,
				signal: AbortSignal.timeout(2e4)
			});
			const assembler = new BlockAssembler();
			for await (const chunk of llm.stream(options)) assembler.push(chunk);
			const text = assembler.blocks().filter((block) => block.type === "text").map((block) => block.text).join(" ");
			const match = /\{[\s\S]*\}/.exec(text);
			if (match === null) return void 0;
			const parsed = JSON.parse(match[0]);
			if (parsed.decision !== "allow" && parsed.decision !== "ask") return void 0;
			return {
				decision: parsed.decision,
				impact: typeof parsed.impact === "string" ? parsed.impact.slice(0, 300) : "（AI 未给出说明）"
			};
		} catch {
			return;
		}
	}
	record(entry) {
		try {
			const record = {
				t: (/* @__PURE__ */ new Date()).toISOString(),
				...entry
			};
			appendFileSync(this.recordsFile, `${JSON.stringify(record)}\n`);
		} catch {}
	}
	/** 最近的安全闸记录（倒序）。 */
	async list(limit) {
		try {
			if (!existsSync(this.recordsFile)) return [];
			return readFileSync(this.recordsFile, "utf8").split("\n").filter((line) => line.trim().length > 0).map((line) => {
				try {
					return JSON.parse(line);
				} catch {
					return null;
				}
			}).filter((record) => record !== null).slice(-limit).reverse();
		} catch {
			return [];
		}
	}
	/** 清空记录。 */
	async clear() {
		try {
			writeFileSync(this.recordsFile, "");
		} catch {}
		return { cleared: true };
	}
};
const REMOTE_METHODS_KEY = "@deepseek-ai/dsh-typert-protocol/remote-methods";
const directMarker = (method) => Object.freeze({
	method,
	invocation: Object.freeze({ kind: "direct" })
});
Object.defineProperty(JxSshGuardGateway.prototype, REMOTE_METHODS_KEY, {
	configurable: true,
	value: Object.freeze({
		version: 1,
		methods: Object.freeze([directMarker("list"), directMarker("clear")])
	})
});
//#endregion
export { JxSshGuardGateway, JxSshGuardGateway as default, analyze, name };
