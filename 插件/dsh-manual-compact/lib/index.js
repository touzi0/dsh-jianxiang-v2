import { CompactionId, ManualCompactionError, compactCheckpointSource, toolPairingBalancedAfter, toolPairingBalancedBefore } from "@deepseek-ai/dsh-compaction";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createUserMessage, errorChain } from "@deepseek-ai/dsh-llm";
import { SessionSeq } from "@deepseek-ai/dsh-session";
//#region ../../packages/compaction/compaction-basic/src/summarizer.ts
/** Tags wrapping the structured summary inside the landed checkpoint node. */
const SUMMARY_OPEN_TAG = "<compacted-summary>";
const SUMMARY_CLOSE_TAG = "</compacted-summary>";
[
	"You are now acting as a compaction engine for this AI coding assistant. Condense the conversation ABOVE into a structured checkpoint that lets another model resume the work with no loss of essential context.",
	"",
	"Output EXACTLY the Markdown structure below: keep every section, in order. Use terse bullets, not prose paragraphs. Write \"(none)\" for an empty section — never drop a section.",
	"",
	"## Primary Request and Intent",
	"- [the user's original and evolving goals; quote verbatim where the exact wording matters]",
	"",
	"## Key Technical Concepts",
	"- [technologies, frameworks, patterns, and conventions in play]",
	"",
	"## Files and Code",
	"- [exact path: why it matters, key changes or snippets]",
	"",
	"## Errors and Fixes",
	"- [error: how it was resolved, plus any related user feedback]",
	"",
	"## Pending Jobs",
	"- [explicitly requested work not yet completed]",
	"",
	"## Current Work",
	"- [precisely what was in progress at this checkpoint]",
	"",
	"## Next Step",
	"- [the single next action, directly in line with the most recent request, or \"(none)\"]",
	"",
	"## Critical Context",
	"- [decisions and their rationale, constraints, user preferences, open questions, data needed to continue]",
	"",
	"Rules:",
	"- Write concise English engineering prose. Preserve exact file paths, commands, error strings, identifiers, numeric values, function signatures, and syntax fragments.",
	"- Capture user feedback and explicit instructions faithfully, especially corrections.",
	"- Do NOT mention this summarization request or that the context was compacted.",
	"- Output only the checkpoint text: do not call any tool or take any other action.",
	`- If the conversation already contains a ${SUMMARY_OPEN_TAG} block, it is a PRIOR checkpoint. Do not copy it forward verbatim: preserve still-true facts, drop stale ones, and merge newer information into a single consolidated summary under the same structure.`
].join("\n");
/** Framing that makes the replacement user message established context. */
const CHECKPOINT_PREAMBLE = "This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.";
/**
* Wrap raw summary blocks in the durable checkpoint framing.
* @param summary - safe text-only model output.
* @returns content for the synthesized replacement user message.
*/
function frameSummary(summary) {
	return [
		{
			type: "text",
			text: `${CHECKPOINT_PREAMBLE}\n\n${SUMMARY_OPEN_TAG}`
		},
		...summary,
		{
			type: "text",
			text: SUMMARY_CLOSE_TAG
		}
	];
}
//#endregion
//#region ../../packages/compaction/compaction-basic/src/region.ts
/**
* Surface retention selection and the shared log-recorded compaction
* transaction for automatic open-turn and manual idle-session compaction.
*
* @module @deepseek-ai/dsh-compaction-basic/region
*/
/**
* Rejects a summary whose replacement boundaries are no longer the ones it was
* built from, distinguished from summarizer and shrink failures so a manual
* caller can report the two causes differently.
*/
var SurfaceChangedError = class extends Error {};
/**
* The `system/message` holding surface node 0, or `undefined` when another
* message-producing event starts the surface.
* @param session - session supplying the log behind the current surface.
* @param headSeq - seq at surface node 0 of a non-empty surface.
* @returns the system head event, or `undefined` without one.
*/
function systemHead(session, headSeq) {
	const head = session.eventAt(headSeq);
	return head.type === "system/message" ? head : void 0;
}
/**
* Run the single compaction transaction over one selected positional span.
* Selection and validation are read-only. Idle/log validation and
* `compaction/start` are synchronously adjacent, so the durable opening marker is
* the compaction lock before summarization yields. Every later failure makes
* exactly one `compaction/end` attempt; a failed close deliberately leaves the
* unmatched start detectable.
* @param dependencies - conversation meter and dynamically dispatched summarizer hook.
* @param session - session whose surface is mutated.
* @param start - inclusive first surface-node seq.
* @param end - inclusive last surface-node seq.
* @param agent - agent used by the summarizer.
* @param options - bracket owner, stability rule, and optional durability checkpoint.
* @param signal - optional summarization cancellation signal.
* @returns the successful durable compaction result.
*/
async function compactSurfaceRegion(dependencies, session, start, end, agent, options, signal) {
	if (options.owner === null) signal?.throwIfAborted();
	const selection = validateSurfaceRegion(session, start, end);
	const entryState = inspectCompactionEntryState(session);
	assertCompactionInactive(entryState.unmatchedCompactionStart, entryState.latestEndSeedSeq, "compaction");
	let owner;
	if (options.owner === null) {
		if (entryState.openTurn !== null) throw new ManualCompactionError("busy", "manual compaction: the session already has an open turn");
		owner = null;
	} else {
		if (entryState.openTurn === null) throw new Error("compactRegion: no open turn — automatic compaction events must be enclosed in a turn");
		owner = entryState.openTurn;
	}
	const compactionId = CompactionId(randomUUID());
	const lifecycle = {
		compactionId,
		...options.sourceCommandId === void 0 ? {} : { sourceCommandId: options.sourceCommandId },
		turn: owner
	};
	const startEvent = session.append("compaction/start", lifecycle);
	const assertStable = options.stability === "whole-surface" ? assertWholeSurfaceUnchanged : assertSelectedSpanStable;
	let failure;
	let flushFailure;
	let result;
	let closed = false;
	let closing = false;
	let stage = "summary";
	try {
		const summarized = await summarizeCompaction(dependencies, prepareCompaction(dependencies, session, selection), agent, compactionId, options.sourceCommandId, assertStable, signal);
		if (options.owner === null) signal?.throwIfAborted();
		assertStable(dependencies, session, summarized);
		stage = "commit";
		const pending = commitCompactionBody(session, startEvent, summarized);
		closing = true;
		const endEvent = session.append("compaction/end", lifecycle);
		closed = true;
		result = completeCompaction(pending, endEvent);
	} catch (error) {
		failure = {
			error,
			stage: closing ? "commit" : stage
		};
		if (!closing) {
			closing = true;
			try {
				session.append("compaction/end", {
					...lifecycle,
					error: errorChain(error)
				});
				closed = true;
			} catch (closeError) {
				failure = {
					error: closeError,
					stage: "commit"
				};
			}
		}
	}
	if (closed && options.flush !== void 0) try {
		await options.flush();
	} catch (error) {
		flushFailure = error;
	}
	if (options.owner === null) signal?.throwIfAborted();
	if (failure !== void 0) {
		if (options.owner === null) throwManualFailure(failure);
		throw failure.error;
	}
	if (flushFailure !== void 0) throw new ManualCompactionError("persistence", "manual compaction durability checkpoint failed", { cause: flushFailure });
	/* v8 ignore next -- every path without a result records and throws a failure above. */
	if (result === void 0) throw new Error("compaction committed without a result");
	return result;
}
/** Classify one closed manual attempt without weakening cancellation precedence. */
function throwManualFailure(failure) {
	if (failure.stage === "commit") throw new ManualCompactionError("commit", "manual compaction did not commit cleanly", { cause: failure.error });
	if (failure.error instanceof SurfaceChangedError) throw new ManualCompactionError("changed", "the compacted history changed during manual compaction", { cause: failure.error });
	throw new ManualCompactionError("summary", "manual compaction could not produce a smaller summary", { cause: failure.error });
}
/**
* Reject a durable unmatched compaction marker unless a later constructor-seed
* boundary proves that its owner belongs to an earlier session lifecycle.
* @param unmatchedCompactionStart - latest unmatched opening marker, if any.
* @param latestEndSeedSeq - newest constructor-seed boundary, if any.
* @param stage - operation label included in the busy diagnostic.
*/
function assertCompactionInactive(unmatchedCompactionStart, latestEndSeedSeq, stage) {
	if (unmatchedCompactionStart === void 0 || latestEndSeedSeq !== void 0 && latestEndSeedSeq > unmatchedCompactionStart.seq) return;
	throw new ManualCompactionError("busy", `${stage}: compaction already in progress; the session compaction lock is already active`);
}
/** Validate one requested surface-position span before asynchronous work begins. */
function validateSurfaceRegion(session, start, end) {
	const nodes = session.surface.nodes;
	const startIdx = nodes.indexOf(start);
	const endIdx = nodes.indexOf(end);
	if (startIdx === -1) throw new Error(`compactRegion: start seq ${start} not found in surface`);
	if (endIdx === -1) throw new Error(`compactRegion: end seq ${end} not found in surface`);
	if (startIdx > endIdx) throw new Error(`compactRegion: start seq ${start} (position ${startIdx}) is after end seq ${end} (position ${endIdx}) on the surface`);
	if (!toolPairingBalancedBefore(session, nodes[startIdx])) throw new Error(`compactRegion: start seq ${start} is not a balanced boundary (would split a step's tool-call/result pair)`);
	if (!toolPairingBalancedAfter(session, nodes[endIdx])) throw new Error(`compactRegion: end seq ${end} is not a balanced boundary (would split a step, or the step is still open)`);
	return {
		start,
		end,
		startIdx,
		endIdx,
		shadowedSeqs: nodes.slice(startIdx, endIdx + 1)
	};
}
/** Snapshot pricing and replay input for a validated surface range. */
function prepareCompaction(dependencies, session, selection) {
	const measurement = dependencies.meter.measure(session);
	const selectedNodes = measurement.nodes.slice(selection.startIdx, selection.endIdx + 1);
	if (selectedNodes.length !== selection.shadowedSeqs.length || selectedNodes.some((node, index) => node.seq !== selection.shadowedSeqs[index])) throw new SurfaceChangedError("compaction: selected surface changed before summarization began");
	return {
		...selection,
		measurement,
		selectedNodes,
		shadowedTokenCount: selectedNodes.reduce((total, node) => total + node.heuristicTokens, 0),
		shadowedRouteTokenCount: selectedNodes.reduce((total, node) => total + node.tokens, 0),
		input: buildSummarizationInput(session, selection.shadowedSeqs)
	};
}
/** Run the summarizer and frame its replacement checkpoint. */
async function summarizeCompaction(dependencies, prepared, agent, compactionId, sourceCommandId, assertStable, signal) {
	let summaryResult;
	for (;;) {
		signal?.throwIfAborted();
		try {
			summaryResult = await dependencies.summarize(prepared.input, agent, signal);
			break;
		} catch (error) {
			if (signal?.aborted === true) throw error;
			assertStable(dependencies, agent.session, prepared);
			if (!dependencies.recover(error, agent, prepared.shadowedSeqs, signal)) throw error;
			prepared = prepareCompaction(dependencies, agent.session, validateSurfaceRegion(agent.session, prepared.start, prepared.end));
		}
	}
	const checkpointMessage = createUserMessage({
		content: frameSummary(summaryResult.summary),
		source: compactCheckpointSource(compactionId, sourceCommandId)
	});
	const framedSummaryTokenCount = dependencies.meter.estimateMessage(checkpointMessage);
	if (framedSummaryTokenCount >= prepared.shadowedRouteTokenCount) throw new Error(`summary is not smaller than the shadowed content (${framedSummaryTokenCount} estimated framed tokens >= ${prepared.shadowedRouteTokenCount})`);
	return {
		...prepared,
		...summaryResult,
		checkpointMessage
	};
}
/** Reject a summary prepared against any earlier surface generation. */
function assertWholeSurfaceUnchanged(dependencies, session, prepared) {
	if (!isDeepStrictEqual(dependencies.meter.measure(session).nodes, prepared.measurement.nodes)) throw new SurfaceChangedError("compaction: session surface changed during summarization");
}
/**
* Require only that the selected span remain the same present, contiguous,
* equally priced, balanced replacement target. Nodes added outside it remain
* visible and do not invalidate the summary.
*/
function assertSelectedSpanStable(dependencies, session, prepared) {
	let current;
	try {
		current = validateSurfaceRegion(session, prepared.start, prepared.end);
	} catch (error) {
		throw new SurfaceChangedError("compaction: the selected span is no longer a valid replacement target", { cause: error });
	}
	if (!isDeepStrictEqual([...current.shadowedSeqs], [...prepared.shadowedSeqs])) throw new SurfaceChangedError("compaction: the selected span changed during summarization");
	if (!isDeepStrictEqual(dependencies.meter.measure(session).nodes.slice(current.startIdx, current.endIdx + 1), prepared.selectedNodes)) throw new SurfaceChangedError("compaction: the selected span was rewritten during summarization");
}
/** Append one completed summary record and replacement body without yielding. */
function commitCompactionBody(session, startEvent, summarized) {
	const { start, end, shadowedSeqs, shadowedTokenCount, summary, provider, model, maxTokens, usage, checkpointMessage } = summarized;
	const callRecord = summarized.llmStreamCall === true ? {
		rawOutput: summarized.rawOutput,
		llmStreamCall: true
	} : summarized.rawOutput === void 0 ? {} : { rawOutput: summarized.rawOutput };
	const summaryEvent = session.append("compaction/summary", {
		compactionId: startEvent.data.compactionId,
		...startEvent.data.sourceCommandId === void 0 ? {} : { sourceCommandId: startEvent.data.sourceCommandId },
		summary,
		...callRecord,
		shadowedRange: {
			start,
			end
		},
		shadowedSeqs: [...shadowedSeqs],
		shadowedTokenCount,
		provider,
		model,
		...maxTokens === void 0 ? {} : { maxTokens },
		...usage === void 0 ? {} : { usage }
	});
	session.append("user/message", checkpointMessage, {
		surfaceOp: {
			op: "replace",
			startSeq: start,
			endSeq: end
		},
		sourceEventSeqs: [
			startEvent.seq,
			summaryEvent.seq,
			...shadowedSeqs
		]
	});
	return {
		compactionId: startEvent.data.compactionId,
		...startEvent.data.sourceCommandId === void 0 ? {} : { sourceCommandId: startEvent.data.sourceCommandId },
		startSeq: startEvent.seq,
		summarySeq: summaryEvent.seq,
		summary,
		shadowedRange: {
			start,
			end
		},
		shadowedSeqs: [...shadowedSeqs],
		shadowedTokenCount
	};
}
/** Attach the successfully appended close event to a pending result. */
function completeCompaction(pending, endEvent) {
	return {
		...pending,
		endSeq: endEvent.seq
	};
}
/**
* Reconstruct the last routed request's cacheable prefix for the shadowed
* region: the system prompt held by the `system/message` at surface node 0,
* the header's tool schemas, then the region's own derived messages in surface
* order. The summarizer appends only the compaction instruction after this, so
* the call is a genuine prefix of the conversation and reuses the provider's
* KV cache. A surface without a system head, or whose head projects to no
* message, contributes no leading system message.
* @param session - session supplying the surface head, request header, and per-node projection.
* @param shadowedSeqs - the surface-node seqs, in order, being compacted.
* @returns the replayed conversation prefix to condense.
*/
function buildSummarizationInput(session, shadowedSeqs) {
	const header = session.requestHeader();
	const head = systemHead(session, session.surface.nodes[0]);
	const system = head === void 0 ? null : session.deriveEventMessage(head);
	const regionMessages = shadowedSeqs.map((seq) => session.deriveEventMessage(session.eventAt(seq))).filter((message) => message !== null);
	return {
		...header?.tools === void 0 ? {} : { tools: header.tools },
		messages: system === null ? regionMessages : [system, ...regionMessages]
	};
}
/** Inspect open-turn, unmatched-compaction, and latest seed-boundary state independently. */
function inspectCompactionEntryState(session) {
	let openTurn = null;
	let openTurnStateKnown = false;
	let unmatchedCompactionStart;
	let compactionEntryStateKnown = false;
	let latestEndSeedSeq;
	for (let seq = session.seq - 1; seq >= 0; seq -= 1) {
		const event = session.eventAt(SessionSeq(seq));
		if (latestEndSeedSeq === void 0 && event.type === "session/end-seed") latestEndSeedSeq = event.seq;
		if (!compactionEntryStateKnown) {
			if (event.type === "compaction/start") {
				unmatchedCompactionStart = event;
				compactionEntryStateKnown = true;
			} else if (event.type === "compaction/end") compactionEntryStateKnown = true;
		}
		if (!openTurnStateKnown) {
			if (event.type === "turn/start") {
				openTurn = event.data.turn;
				openTurnStateKnown = true;
			} else if (event.type === "turn/end") openTurnStateKnown = true;
		}
		if (openTurnStateKnown && compactionEntryStateKnown && latestEndSeedSeq !== void 0) break;
	}
	return {
		openTurn,
		unmatchedCompactionStart,
		latestEndSeedSeq
	};
}
//#endregion
//#region src/compact-range.ts
/**
* 压缩「会话开头到 `anchorSeq` 所在节点为止」的范围（不含 node0 的 system 提示词）。
* @param dependencies - 官方引擎的 `regionDependencies()`。
* @param session - 目标会话（须属于一个空闲的 agent）。
* @param anchorSeq - 用户点击那一轮的最后一个表面节点 seq（客户端反查得到）。
* @param agent - 摘要调用使用的 agent（提供路由与提示词前缀）。
* @param options - 可选的持久化检查点。
* @param signal - 取消信号（runMaintenance 的信号）。
* @returns 成功压缩的数字摘要。
* @throws Error 当该轮不在当前表面上（已被此前的压缩覆盖）或没有可压缩内容；
* 其余错误由官方 `compactSurfaceRegion` 抛出（含 {@link ManualCompactionError}）。
*/
async function compactUpTo(dependencies, session, anchorSeq, agent, options, signal) {
	const surface = session.surface.nodes;
	const endIdx = surface.indexOf(anchorSeq);
	if (endIdx === -1) throw new Error("这一轮的内容已不在当前上下文里（可能已经被之前的压缩覆盖了），无需重复压缩。");
	let startIdx = 0;
	if (surface.length > 0) {
		const head = session.eventAt(surface[0]);
		if (head !== void 0 && head.type === "system/message") startIdx = 1;
	}
	if (endIdx < startIdx) throw new Error("这一轮之前没有可压缩的对话内容。");
	const start = surface[startIdx];
	const end = surface[endIdx];
	const result = await compactSurfaceRegion(dependencies, session, start, end, agent, {
		owner: null,
		stability: "selected-span",
		...options.flush === void 0 ? {} : { flush: options.flush }
	}, signal);
	const summaryChars = result.summary.reduce((total, block) => total + (block.type === "text" && typeof block.text === "string" ? block.text.length : 0), 0);
	return {
		shadowedCount: result.shadowedSeqs.length,
		shadowedTokens: result.shadowedTokenCount,
		summaryChars
	};
}
//#endregion
//#region src/index.ts
const name = "dsh-manual-compact";
/** 把官方压缩错误翻译成界面能直接显示的中文。 */
function describeCompactionError(error) {
	if (error instanceof ManualCompactionError) switch (error.code) {
		case "busy": return "会话正在运行，或已有一次压缩在进行；等当前活动结束后再试。";
		case "cancelled": return "压缩已取消。";
		case "changed": return "压缩期间这一段对话发生了变化，本次压缩未生效（尝试过程已记录在会话日志里）。";
		case "summary": return "这一轮之前的内容压不出更小的摘要（内容可能太少或已经很紧凑），没有做任何改动。";
		case "commit": return "压缩没有干净地完成，部分历史可能已变化；请检查会话当前状态后再试。";
		case "persistence": return "压缩已完成，但会话保存失败。";
		default: return `压缩失败：${error.message}`;
	}
	return error instanceof Error ? error.message : String(error);
}
/**
* 「手动压缩」网关：浏览器半边每轮按钮行的入口。
*/
var JxManualCompactGateway = class extends TypertRemoteService {
	/** 缺了就不挂载的服务；其余用 ctx.get 动态读取（可选降级成可读错误）。 */
	static inject = ["agents", "sessions"];
	constructor(ctx) {
		super(ctx, "jxManualCompact");
	}
	get agents() {
		return this.ctx.agents;
	}
	get sessions() {
		return this.ctx.sessions;
	}
	/**
	* 把「点击那一轮及其之前」的对话用官方压缩机制压成摘要。
	* @param sessionId - 目标会话 id。
	* @param turn - 轮号（展示用）。
	* @param anchorSeq - 该轮最后一个表面节点的 seq。
	* @returns 压缩数字摘要；失败时抛错（message 为中文原因）。
	*/
	async compact(sessionId, turn, anchorSeq) {
		const agent = await this.ensureAgent(String(sessionId));
		const engine = this.ctx.get("compaction");
		if (engine === void 0 || typeof engine.regionDependencies !== "function") throw new Error("当前部署没有可用的官方压缩服务（compaction-basic），本按钮依赖它工作；请检查服务端插件配置。");
		const dependencies = engine.regionDependencies();
		const session = agent.session;
		let task;
		try {
			task = agent.runMaintenance(async (signal) => compactUpTo(dependencies, session, Number(anchorSeq), agent, { flush: async () => {
				await this.sessions.flush(session);
			} }, signal));
		} catch (error) {
			throw new ManualCompactionError("busy", "manual compaction requires an idle agent", { cause: error });
		}
		try {
			return await task;
		} catch (error) {
			throw new Error(describeCompactionError(error));
		}
	}
	/** 取活跃 agent；冷会话按它记录的 preset 恢复（写法同 dsh-digital-assistant）。 */
	async ensureAgent(sessionId) {
		const live = this.agents.get(sessionId);
		if (live !== void 0) return live;
		const resumeOptions = {
			resumeSessionId: sessionId,
			agentOptions: this.resolveRoute()
		};
		const presets = this.ctx.get("agentPresets");
		let presetId;
		const sessionQuery = this.ctx.get("sessionQuery");
		if (sessionQuery !== void 0 && presets !== void 0) try {
			const recorded = (await sessionQuery.readSession(sessionId))?.session?.agentPreset;
			if (typeof recorded === "string" && recorded !== "") presetId = recorded;
		} catch (error) {
			this.warn(`读取会话 ${sessionId} 的记录失败（按无 preset 冷恢复）：${String(error)}`);
		}
		if (presets !== void 0 && presetId !== void 0) resumeOptions.setup = async (agentCtx) => {
			await presets.mount(agentCtx, presetId);
		};
		return (await this.agents.resume(resumeOptions)).agent;
	}
	/** 冷恢复的模型路由：会话自己的请求头优先不存在时用全局默认（同官方 resume）。 */
	resolveRoute() {
		const current = this.ctx.get("agentDefaultModel")?.currentSelection?.();
		if (typeof current?.provider === "string" && current.provider !== "" && typeof current?.model === "string" && current.model !== "") return {
			provider: current.provider,
			model: current.model
		};
		throw new Error("无法确定模型路由（agent-default-model 服务不可用或尚未选择模型）；请先在会话里正常对话一次，再使用压缩按钮。");
	}
	/** 统一的告警出口（模组不静默吞错）。 */
	warn(message) {
		try {
			console.warn(`[dsh-manual-compact] ${message}`);
		} catch {}
	}
};
Object.defineProperty(JxManualCompactGateway.prototype, "@deepseek-ai/dsh-typert-protocol/remote-methods", {
	configurable: true,
	value: Object.freeze({
		version: 1,
		methods: Object.freeze([Object.freeze({
			method: "compact",
			invocation: Object.freeze({ kind: "direct" })
		})])
	})
});
//#endregion
export { JxManualCompactGateway, JxManualCompactGateway as default, describeCompactionError, name };
