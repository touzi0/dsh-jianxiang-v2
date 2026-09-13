import { defineTool } from "@deepseek-ai/dsh-tools";
import { toolPairingBalancedAfter, toolPairingBalancedBefore } from "@deepseek-ai/dsh-compaction";
//#region src/index.ts
const name = "dsh-compaction-tools";
const inject = [
	"tools",
	"compaction",
	"tokenMeter"
];
function blockText(blocks) {
	if (blocks === void 0) return "";
	return blocks.filter((block) => block.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n");
}
function truncateUtf8(input, maxBytes) {
	if (Buffer.byteLength(input, "utf8") <= maxBytes) return input;
	let used = 0;
	let output = "";
	for (const character of input) {
		const bytes = Buffer.byteLength(character, "utf8");
		if (used + bytes > maxBytes) break;
		output += character;
		used += bytes;
	}
	return output;
}
/** 事件的人类可读角色标签。 */
function roleOf(event) {
	switch (event.type) {
		case "user/message": return "用户";
		case "assistant/message": return "助手";
		case "tool/result": return "工具结果";
		case "compaction/summary": return "压缩摘要";
		default: return event.type;
	}
}
/**
* 计算建议压缩范围（尾部偏向增量，前缀缓存友好）：
* - 跳过 system 头；从尾部保留 retainRatio；
* - 首选只压「上一个摘要检查点之后」的新内容——已有摘要不动，压缩点之前
*   的请求前缀字节不变，缓存命中与逐轮追加时一致（bili 的 staged 策略同款）；
* - 摘要堆积到新内容不足最小阈值时，级联把旧摘要一起重折（此时前缀缓存
*   会整体重置，属于多代压缩的罕见兜底）；
* - 边界用官方 toolPairingBalancedBefore/After 收拢，工具配对不拆。
*/
function computeCompressibleRange(session, measurement, config) {
	const nodes = measurement.nodes;
	if (nodes.length < 3) return null;
	const eventBySeq = /* @__PURE__ */ new Map();
	for (const event of session.events) eventBySeq.set(event.seq, event);
	const isSummaryNode = (seq) => {
		const event = eventBySeq.get(seq);
		return event?.type === "user/message" && event.data?.source?.plugin === "compact";
	};
	let lastSummaryIdx = 0;
	for (let i = 1; i < nodes.length; i++) if (isSummaryNode(nodes[i]?.seq ?? -1)) lastSummaryIdx = i;
	const retainTokens = measurement.surfaceTokens * config.retainRatio;
	let kept = 0;
	let boundary = nodes.length;
	for (let i = nodes.length - 1; i >= 1; i--) {
		if (kept >= retainTokens) break;
		kept += nodes[i]?.tokens ?? 0;
		boundary = i;
	}
	const maxEnd = Math.min(boundary - 1, nodes.length - 2);
	if (maxEnd <= 1) return null;
	const pick = (startIdx) => {
		if (startIdx >= maxEnd) return null;
		let end = maxEnd;
		for (let step = 0; step < nodes.length && end > startIdx + 1; step++) {
			const seq = nodes[end]?.seq;
			if (seq === void 0) return null;
			let balanced = false;
			try {
				balanced = toolPairingBalancedAfter(session, seq);
			} catch {
				return null;
			}
			if (balanced) break;
			end--;
		}
		let start = startIdx;
		for (let step = 0; step < nodes.length && start < end; step++) {
			const seq = nodes[start]?.seq;
			if (seq === void 0) return null;
			let balanced = false;
			try {
				balanced = toolPairingBalancedBefore(session, seq);
			} catch {
				return null;
			}
			if (balanced) break;
			start++;
		}
		if (start >= end) return null;
		let tokens = 0;
		for (let i = start; i <= end; i++) tokens += nodes[i]?.tokens ?? 0;
		if (tokens < config.minCompressTokens) return null;
		return {
			startSeq: nodes[start]?.seq,
			endSeq: nodes[end]?.seq,
			tokens: Math.round(tokens)
		};
	};
	const incremental = pick(lastSummaryIdx + 1);
	if (incremental !== null) return {
		...incremental,
		cascade: false
	};
	if (lastSummaryIdx > 0) {
		const cascaded = pick(1);
		if (cascaded !== null) return {
			...cascaded,
			cascade: true
		};
	}
	return null;
}
/** 汇总状态面板文本。 */
function renderStatus(session, measurement, suggestion, config) {
	const lines = [];
	lines.push(`当前上下文压力：约 ${measurement.totalTokens} tokens（表面 ${measurement.surfaceTokens}，共 ${measurement.nodes.length} 个表面节点）。`);
	const onSurface = new Set(session.surface.nodes);
	const blocks = session.events.filter((event) => event.type === "compaction/summary");
	if (blocks.length > 0) lines.push(`历史压缩：${blocks.length} 次，共折叠 ${blocks.reduce((total, event) => total + (event.data.shadowedSeqs?.length ?? 0), 0)} 条消息。`);
	if (suggestion !== null) lines.push(`建议压缩范围：seq ${suggestion.startSeq} ~ ${suggestion.endSeq}（约 ${suggestion.tokens} tokens，保留最近 ${Math.round(config.retainRatio * 100)}%${suggestion.cascade ? "；注意：本次需级联重折旧摘要，前缀缓存会重置" : "；增量折叠，已有摘要不动，缓存前缀保持稳定"}）。调用 context_compress 并传 startSeq=${suggestion.startSeq}, endSeq=${suggestion.endSeq}。`);
	else lines.push("当前没有值得压缩的范围（历史太短或不足最小阈值）。");
	lines.push(`被折叠的原文仍在日志里：可用 search_history 检索、context_restore 取回。当前表面外的 seq：${session.events.filter((event) => onSurface.has(event.seq) === false && (event.type === "user/message" || event.type === "assistant/message")).length} 条。`);
	return lines.join("\n");
}
function apply(ctx, config = {}) {
	const policy = {
		retainRatio: config.retainRatio ?? .25,
		minCompressTokens: config.minCompressTokens ?? 2e3,
		restoreByteCap: config.restoreByteCap ?? 24e3,
		searchMaxResults: config.searchMaxResults ?? 8
	};
	const compaction = ctx.compaction;
	const tokenMeter = ctx.tokenMeter;
	const agentOf = (exec) => {
		if (exec.agent === void 0) throw new Error("dsh-compaction-tools: 仅能在会话内使用（找不到当前 agent）");
		return exec.agent;
	};
	ctx.tools.register(defineTool({
		name: "context_status",
		description: "查看当前上下文压力与可压缩范围（含具体 seq）。长对话中途、或感觉历史很长时调用，据此决定是否调用 context_compress。",
		parameters: {},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { text: {
					type: "string",
					required: true
				} }
			},
			render: (_args, value) => [{
				type: "text",
				text: value.text
			}]
		},
		async execute(_args, exec) {
			const agent = agentOf(exec);
			const measurement = tokenMeter.measure(agent.session);
			const suggestion = computeCompressibleRange(agent.session, measurement, policy);
			return { text: renderStatus(agent.session, measurement, suggestion, policy) };
		}
	}));
	ctx.tools.register(defineTool({
		name: "context_compress",
		description: "把一段历史折叠成摘要，释放上下文空间。先调 context_status 拿建议范围；传入其给出的 startSeq/endSeq（省略则自动选择）。折叠后摘要保留关键信息，原文仍可用 search_history 检索、context_restore 取回。用户界面会显示本次压缩的标记与摘要。",
		parameters: {
			startSeq: {
				type: "number",
				description: "折叠范围起始 seq（来自 context_status 的建议）。省略则自动选择。"
			},
			endSeq: {
				type: "number",
				description: "折叠范围结束 seq（含）。省略则自动选择。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { text: {
					type: "string",
					required: true
				} }
			},
			render: (_args, value) => [{
				type: "text",
				text: value.text
			}]
		},
		async execute(args, exec) {
			const agent = agentOf(exec);
			let start = args.startSeq;
			let end = args.endSeq;
			if (start === void 0 || end === void 0) {
				const measurement = tokenMeter.measure(agent.session);
				const suggestion = computeCompressibleRange(agent.session, measurement, policy);
				if (suggestion === null) return { text: "当前没有值得压缩的范围（历史太短或不足最小阈值）。不需要调用本工具。" };
				start = suggestion.startSeq;
				end = suggestion.endSeq;
			}
			const result = await compaction.compactRegion(start, end, agent, exec.signal);
			const summaryText = blockText(result.summary);
			return { text: [
				`已压缩：折叠 ${result.shadowedSeqs.length} 条消息（约 ${result.shadowedTokenCount} tokens），摘要已置入上下文。`,
				summaryText === "" ? "" : `摘要开头：${truncateUtf8(summaryText, 400)}`,
				"原文仍在日志里：需要细节时用 search_history 检索、context_restore 取回。"
			].filter((line) => line !== "").join("\n") };
		}
	}));
	ctx.tools.register(defineTool({
		name: "search_history",
		description: "按关键词检索本会话完整日志原文（包括已被压缩折叠的内容）。需要回忆早前讨论、决定、命令输出时调用。",
		parameters: {
			query: {
				type: "string",
				description: "关键词（不区分大小写的子串匹配）。"
			},
			maxResults: {
				type: "number",
				description: `最多返回条数（默认 ${policy.searchMaxResults}）。`
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { text: {
					type: "string",
					required: true
				} }
			},
			render: (_args, value) => [{
				type: "text",
				text: value.text
			}]
		},
		async execute(args, exec) {
			const agent = agentOf(exec);
			const query = args.query.toLowerCase();
			if (query === "") return { text: "query 不能为空。" };
			const limit = args.maxResults ?? policy.searchMaxResults;
			const onSurface = new Set(agent.session.surface.nodes);
			const matches = [];
			for (const event of agent.session.events) {
				if (event.type !== "user/message" && event.type !== "assistant/message" && event.type !== "tool/result") continue;
				const text = blockText(event.data.content ?? event.data.blocks);
				if (text === "") continue;
				const at = text.toLowerCase().indexOf(query);
				if (at === -1) continue;
				const excerpt = truncateUtf8(text.slice(Math.max(0, at - 100), at + 200), 320);
				const folded = onSurface.has(event.seq) ? "" : "（已被压缩折叠）";
				matches.push(`[seq ${event.seq}] ${roleOf(event)}${folded}：…${excerpt}…`);
				if (matches.length >= limit) break;
			}
			if (matches.length === 0) return { text: `没有找到包含「${args.query}」的内容。` };
			return { text: [`找到 ${matches.length} 条：`, ...matches].join("\n") };
		}
	}));
	ctx.tools.register(defineTool({
		name: "context_restore",
		description: "取回一段日志原文（常配合 search_history 的 seq 使用，恢复被压缩折叠的细节）。内容以本工具结果形式一次性返回，不改变对话结构。",
		parameters: {
			startSeq: {
				type: "number",
				description: "起始 seq（含）。"
			},
			endSeq: {
				type: "number",
				description: "结束 seq（含）。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { text: {
					type: "string",
					required: true
				} }
			},
			render: (_args, value) => [{
				type: "text",
				text: value.text
			}]
		},
		async execute(args, exec) {
			const events = agentOf(exec).session.events.filter((event) => event.seq >= args.startSeq && event.seq <= args.endSeq && (event.type === "user/message" || event.type === "assistant/message" || event.type === "tool/result"));
			if (events.length === 0) return { text: `seq ${args.startSeq} ~ ${args.endSeq} 范围内没有可读消息。` };
			const body = events.map((event) => {
				const text = blockText(event.data.content ?? event.data.blocks);
				return `[seq ${event.seq}] ${roleOf(event)}：${text === "" ? "（无文本内容）" : text}`;
			}).join("\n\n");
			return { text: truncateUtf8(body, policy.restoreByteCap) + (Buffer.byteLength(body, "utf8") > policy.restoreByteCap ? "\n（超出字节上限已截断，可缩小范围分段取回）" : "") };
		}
	}));
}
//#endregion
export { apply, computeCompressibleRange, inject, name };
