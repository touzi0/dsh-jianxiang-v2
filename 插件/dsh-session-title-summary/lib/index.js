import z from "@deepseek-ai/schemastery";
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";
import { MAX_TIMER_DELAY_MS, deadline } from "@deepseek-ai/dsh-timeout";
import { SessionTitleProviderId } from "@deepseek-ai/dsh-session-title";
import { SESSION_TITLE_TIMEOUT_CODE } from "@deepseek-ai/dsh-session-title-llm";
import { deepFreeze } from "@deepseek-ai/dsh-util-values";
//#region \0@oxc-project+runtime@0.135.0/helpers/esm/usingCtx.js
function _usingCtx() {
	var r = "function" == typeof SuppressedError ? SuppressedError : function(r, e) {
		var n = Error();
		return n.name = "SuppressedError", n.error = r, n.suppressed = e, n;
	}, e = {}, n = [];
	function using(r, e) {
		if (null != e) {
			if (Object(e) !== e) throw new TypeError("using declarations can only be used with objects, functions, null, or undefined.");
			if (r) var o = e[Symbol.asyncDispose || Symbol["for"]("Symbol.asyncDispose")];
			if (void 0 === o && (o = e[Symbol.dispose || Symbol["for"]("Symbol.dispose")], r)) var t = o;
			if ("function" != typeof o) throw new TypeError("Object is not disposable.");
			t && (o = function o() {
				try {
					t.call(e);
				} catch (r) {
					return Promise.reject(r);
				}
			}), n.push({
				v: e,
				d: o,
				a: r
			});
		} else r && n.push({
			d: e,
			a: r
		});
		return e;
	}
	return {
		e,
		u: using.bind(null, !1),
		a: using.bind(null, !0),
		d: function d() {
			var o, t = this.e, s = 0;
			function next() {
				for (; o = n.pop();) try {
					if (!o.a && 1 === s) return s = 0, n.push(o), Promise.resolve().then(next);
					if (o.d) {
						var r = o.d.call(o.v);
						if (o.a) return s |= 2, Promise.resolve(r).then(next, err);
					} else s |= 1;
				} catch (r) {
					return err(r);
				}
				if (1 === s) return t !== e ? Promise.reject(t) : Promise.resolve();
				if (t !== e) throw t;
			}
			function err(n) {
				return t = t !== e ? new r(n, t) : n, next();
			}
			return next();
		}
	};
}
//#endregion
//#region src/index.ts
const name = "dsh-session-title-summary";
const inject = [
	"sessionTitle",
	"llm",
	"sessions"
];
const Config = z.object({
	interval: z.number().step(1).min(1).required(),
	recentCount: z.number().step(1).min(1).required(),
	messageByteCap: z.number().step(1).min(1).required(),
	maxPhrases: z.number().step(1).min(1).required(),
	minPhrases: z.number().step(1).min(1).required(),
	maxTitleBytes: z.number().step(1).min(1).required(),
	maxOutputTokens: z.number().step(1).min(1).required(),
	timeoutMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).required(),
	temperature: z.number().min(0).required(),
	rawQuoteChars: z.number().step(1).min(1).required(),
	provider: z.string(),
	model: z.string()
});
const SPLIT_RE = /[、，,;；|]+/;
const TAIL_PUNCT_RE = /[。！？!?]+$/;
function cleanPhrase(part) {
	return part.replace(/\s+/g, " ").trim().replace(TAIL_PUNCT_RE, "").trim();
}
function isSubstringDuplicate(candidate, existing) {
	return existing.some((item) => candidate.includes(item) || item.includes(candidate));
}
function isRawQuote(phrase, guard) {
	return phrase.length >= guard.minChars && guard.texts.some((text) => text.includes(phrase));
}
function parsePhrases(raw, currentTitle, config, guard) {
	const seen = /* @__PURE__ */ new Set();
	const unique = [];
	for (const part of String(raw).split(SPLIT_RE)) {
		const phrase = cleanPhrase(part);
		if (phrase.length === 0) continue;
		if (guard !== void 0 && isRawQuote(phrase, guard)) continue;
		const key = phrase.toLowerCase();
		if (seen.has(key)) continue;
		if (isSubstringDuplicate(phrase, unique)) continue;
		seen.add(key);
		unique.push(phrase);
		if (unique.length >= config.maxPhrases) break;
	}
	if (unique.length < config.minPhrases && currentTitle !== void 0) for (const part of String(currentTitle).split(SPLIT_RE)) {
		const phrase = cleanPhrase(part);
		if (phrase.length === 0) continue;
		if (guard !== void 0 && isRawQuote(phrase, guard)) continue;
		const key = phrase.toLowerCase();
		if (seen.has(key)) continue;
		if (isSubstringDuplicate(phrase, unique)) continue;
		seen.add(key);
		unique.push(phrase);
		break;
	}
	return unique;
}
function mergeAnchor(anchor, phrases, maxPhrases) {
	const anchorKey = anchor.toLowerCase();
	return [anchor, ...phrases.filter((phrase) => {
		return phrase.toLowerCase() !== anchorKey && !phrase.includes(anchor) && !anchor.includes(phrase);
	})].slice(0, maxPhrases);
}
function firstFreshPhrase(title, guard) {
	for (const part of String(title).split(SPLIT_RE)) {
		const phrase = cleanPhrase(part);
		if (phrase.length === 0) continue;
		if (isRawQuote(phrase, guard)) continue;
		return phrase;
	}
}
function restoreFromLog(events, provider, guard) {
	let anchor;
	let covered;
	for (const event of events) {
		if (event.type !== "session/title") continue;
		const source = event.data.source;
		if (source?.kind !== "provider" || source.provider !== provider) continue;
		for (const seq of event.data.messageSeqs ?? []) covered = Math.max(covered ?? seq, seq);
		if (anchor === void 0 && event.data.title !== void 0) anchor = firstFreshPhrase(event.data.title, guard);
	}
	return {
		...anchor === void 0 ? {} : { anchor },
		...covered === void 0 ? {} : { covered }
	};
}
function systemPrompt(variant) {
	if (variant === "initial") return [
		"你是会话标题助手。你会收到一个 AI 助手会话的开始消息。",
		"任务：为这个新会话生成初始标题。",
		"标题格式：恰好 1 个短语，2~8 个字。",
		"规则：",
		"1. 短语必须完整概括会话的核心意图，让人一眼知道这个会话是干什么的；",
		"2. 必须是概括性的名词短语，严禁照抄或微改用户原话；",
		"3. 不要动词化描述，不要标点、引号、编号、解释或前后缀；",
		"4. 只输出这一行短语，不要顿号及其他任何字符。"
	].join("\n");
	return [
		"你是会话标题助手。你会收到一个 AI 助手会话的信息：当前标题和最近几轮用户消息。",
		"任务：生成新的会话标题。",
		"标题格式：用顿号\"、\"分隔的短语列表，每个短语 2~6 个字，概括会话中的主要话题。",
		"规则：",
		"1. 当前标题的第一个短语是会话的初始话题，必须原样保留在第一位，一字不改；",
		"2. 最近几轮消息涉及的新话题紧跟其后；",
		"3. 从当前标题其余短语中最多保留 1 个仍然重要的旧话题放在末尾；",
		"4. 语义相近或重复的话题必须合并，同一个意思只保留一个短语；",
		"5. 除初始话题外通常再给 1~2 个短语，整个标题最多 4 个短语，宁少勿滥；",
		"6. 每个短语必须是概括性的名词短语，严禁照抄或微改用户原话，不要动词化描述，不要标点、引号、编号、解释或前后缀；",
		"7. 只输出一行，除顿号外不要任何其他字符。"
	].join("\n");
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
function frameInput(variant, currentTitle, recent, config) {
	const lines = recent.map((message, index) => `${index + 1}. ${truncateUtf8(message.text, config.messageByteCap)}`);
	if (variant === "initial") return `会话开始消息：\n${lines.join("\n")}`;
	return `当前标题：${currentTitle ?? "（无）"}\n最近几轮用户消息：\n${lines.join("\n")}`;
}
function routeOf(request, policy) {
	if (policy.provider !== void 0 && policy.model !== void 0) return {
		provider: policy.provider,
		model: policy.model
	};
	return request.route;
}
function apply(ctx, config) {
	const policy = deepFreeze({ ...config });
	const titleProvider = SessionTitleProviderId(name);
	const covered = /* @__PURE__ */ new Map();
	const anchored = /* @__PURE__ */ new Map();
	ctx.on("session/disposed", (session) => {
		covered.delete(session.id);
		anchored.delete(session.id);
	});
	ctx.sessionTitle.register({
		id: titleProvider,
		automatic: "all-prompts",
		async generate(request) {
			try {
				var _usingCtx$1 = _usingCtx();
				const first = request.messages[0];
				if (first === void 0) throw new Error("dsh-session-title-summary: at least one human message is required");
				const session = request.session;
				const latestSeq = request.messages.at(-1)?.seq ?? first.seq;
				if (!covered.has(session.id) && !anchored.has(session.id)) {
					const restored = restoreFromLog(session.events, name, {
						texts: request.messages.map((message) => message.text),
						minChars: policy.rawQuoteChars
					});
					if (restored.covered !== void 0) covered.set(session.id, restored.covered);
					if (restored.anchor !== void 0) anchored.set(session.id, restored.anchor);
				}
				const lastCovered = covered.get(session.id);
				const currentTitle = ctx.sessionTitle.get(session)?.title;
				const freshCount = request.messages.filter((message) => message.seq > (lastCovered ?? -Infinity)).length;
				const adopt = lastCovered === void 0;
				if (!adopt && !(!adopt && freshCount === 0) && freshCount < policy.interval) return {
					title: currentTitle ?? truncateUtf8(first.text, policy.maxTitleBytes),
					messageSeqs: [first.seq]
				};
				const variant = adopt ? "initial" : "rolling";
				const recent = request.messages.slice(-policy.recentCount);
				const guard = {
					texts: recent.map((message) => message.text),
					minChars: policy.rawQuoteChars
				};
				const input = frameInput(variant, currentTitle, recent, policy);
				const route = routeOf(request, policy);
				if (route === void 0) throw new Error("dsh-session-title-summary: no logged request route is available; configure provider and model together");
				const message = createUserMessage({
					content: [{
						type: "text",
						text: input
					}],
					source: {
						kind: "plugin",
						plugin: "dsh-session-title-summary"
					}
				});
				const system = systemPrompt(variant);
				const callDeadline = _usingCtx$1.u(deadline(request.signal, policy.timeoutMs, SESSION_TITLE_TIMEOUT_CODE));
				const options = deepFreeze({
					provider: route.provider,
					model: route.model,
					messages: [message],
					system,
					temperature: policy.temperature,
					maxTokens: policy.maxOutputTokens,
					sessionId: session.id,
					purpose: "session-title",
					signal: callDeadline.signal
				});
				session.append("session/title-llm-request", {
					titleProvider: name,
					messageSeqs: recent.map((item) => item.seq),
					route,
					system,
					messages: [message],
					maxTokens: policy.maxOutputTokens
				});
				callDeadline.signal.throwIfAborted();
				const assembler = new BlockAssembler();
				for await (const chunk of ctx.llm.stream(options)) {
					callDeadline.signal.throwIfAborted();
					assembler.push(chunk);
				}
				callDeadline.signal.throwIfAborted();
				const phrases = parsePhrases(assembler.blocks().filter((block) => block.type === "text").map((block) => block.text).join(" "), adopt ? void 0 : currentTitle, adopt ? {
					maxPhrases: policy.maxPhrases,
					minPhrases: 1
				} : policy, guard);
				const anchor = anchored.get(session.id);
				let titlePhrases;
				if (anchor === void 0) {
					const firstPhrase = phrases.at(0);
					if (firstPhrase === void 0) throw new Error("dsh-session-title-summary: no usable phrases in model output");
					anchored.set(session.id, firstPhrase);
					titlePhrases = phrases;
				} else titlePhrases = mergeAnchor(anchor, phrases, policy.maxPhrases);
				covered.set(session.id, latestSeq);
				return {
					title: truncateUtf8(titlePhrases.join("、"), policy.maxTitleBytes).trimEnd(),
					messageSeqs: recent.map((item) => item.seq),
					model: route
				};
			} catch (_) {
				_usingCtx$1.e = _;
			} finally {
				_usingCtx$1.d();
			}
		}
	});
}
//#endregion
export { Config, apply, inject, mergeAnchor, name, parsePhrases, restoreFromLog, systemPrompt };
