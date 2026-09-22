import { deepFreeze } from "@deepseek-ai/dsh-util-values";
import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
//#region src/rewrite.ts
/** 远端载体：ssh / scp / rsync / sftp / sshpass（出现在命令位，非路径片段）。 */
const REMOTE_CARRIER = /(?:^|[\n;&|(]\s*|\bsudo\s+)(?:ssh|scp|rsync|sftp|sshpass)\b/;
/** 远端命令含复杂结构时改写有风险，宁可放过。 */
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
/** 整根/整主目录级 rm：不属「可安全改写」，留给 dsh-ssh-review 弹窗问人。 */
const NEVER_REWRITE = /\brm\s+(?:-[a-zA-Z-]+\s+)*\/(?:\s|$|\*|;|&)|\brm\s+(?:-[a-zA-Z-]+\s+)*\/\*|\brm\s+(?:-[a-zA-Z-]+\s+)*~(?:\/\*)?(?:\s|$|;|&)/;
function analyzeRewrite(command, config) {
	if (!REMOTE_CARRIER.test(command)) return { kind: "pass" };
	const extracted = extractSshPayload(command);
	if (extracted === void 0) return { kind: "pass" };
	if (NEVER_REWRITE.test(extracted.payload)) return { kind: "pass" };
	if (!/\brm\b/.test(extracted.payload) || UNSAFE_TO_REWRITE.test(extracted.payload)) return { kind: "pass" };
	const parsed = extracted.payload.split(/\s*(?:&&|;)\s*/).filter((segment) => segment.trim().length > 0).map((segment) => parseSimpleRm(segment));
	if (parsed.length === 0 || !parsed.every((part) => part !== void 0)) return { kind: "pass" };
	const newPayload = parsed.map((part) => trashSegment(part.paths, config)).join(" && ");
	return {
		kind: "rewrite",
		rewritten: `${extracted.prefix}"${newPayload}"`,
		note: `[jx-ssh-rm-rewrite] 你的远端 rm 命令已被安全改写为「移入远端回收站 ${config.trashDir}」（保留 ${config.retentionDays} 天后自动清理）。目标路径已从原位置移除，效果与删除一致；若确实要立即彻底删除，可对回收站内路径执行 rm。`
	};
}
//#endregion
//#region src/index.ts
const name = "dsh-ssh-rm-rewrite";
const DEFAULT_CONFIG = {
	trashDir: "~/.jx-trash",
	retentionDays: 7
};
function apply(ctx, config = {}) {
	const merged = {
		...DEFAULT_CONFIG,
		...config
	};
	const recordsFile = join(dirname(fileURLToPath(import.meta.url)), "..", "records.jsonl");
	const pendingNotes = /* @__PURE__ */ new Map();
	const record = (entry) => {
		try {
			const row = {
				t: (/* @__PURE__ */ new Date()).toISOString(),
				...entry
			};
			appendFileSync(recordsFile, `${JSON.stringify(row)}\n`);
		} catch {}
	};
	const pre = async (exec, next) => {
		try {
			if (exec.name !== "bash" && exec.name !== "pwsh") return await next();
			const command = typeof exec.arguments?.command === "string" ? exec.arguments.command : "";
			if (command === "") return await next();
			const verdict = analyzeRewrite(command, merged);
			if (verdict.kind === "pass") return await next();
			let rewrittenOk = false;
			try {
				exec.arguments = deepFreeze({
					...exec.arguments,
					command: verdict.rewritten
				});
				rewrittenOk = true;
			} catch {}
			if (rewrittenOk) {
				pendingNotes.set(exec.callId, verdict.note);
				record({
					action: "rewrite",
					tool: exec.name,
					session: exec.agent?.session.id ?? "",
					command,
					note: verdict.note,
					rewritten: verdict.rewritten
				});
				return await next();
			}
			record({
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
		} catch {
			return await next();
		}
	};
	const post = async (exec, result, next) => {
		const accepted = await next();
		const note = pendingNotes.get(exec.callId);
		pendingNotes.delete(exec.callId);
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
	ctx.on("tools/pre-execute", pre);
	ctx.on("tools/post-execute", post);
}
//#endregion
export { analyzeRewrite, apply, name };
