import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region src/scan.ts
/** 会话扫描顺序：有 cwd 的会话按官方顺序（最新在前）保留。 */
function sessionScanOrder(records) {
	return records.filter((record) => record.cwd !== void 0).map((record) => record.id);
}
/** 取 content blocks 的 text 拼接（与官方 extraction 同规则）。 */
function contentText(content) {
	if (!Array.isArray(content)) return "";
	const parts = [];
	for (const block of content) if (block !== null && typeof block === "object" && block.type === "text") {
		const text = block.text;
		if (typeof text === "string") parts.push(text);
	}
	return parts.join("\n");
}
/** 事件里的可搜索文本；不可搜索事件返回 undefined。 */
function eventText(event) {
	const data = event.data;
	if (data === null || typeof data !== "object") return void 0;
	if (event.type === "user/message") {
		if (data.source?.kind !== "user") return void 0;
		return contentText(data.content);
	}
	if (event.type === "assistant/message") {
		const message = data.message;
		return contentText(message?.content);
	}
}
/** 以命中位置为中心截取摘要窗口，超界加省略号。 */
function makeSnippet(text, index, radius) {
	const characters = Array.from(text);
	if (characters.length <= radius * 2 + 4) return text;
	const start = Math.max(0, index - radius);
	const end = Math.min(characters.length, index + radius);
	return `${start > 0 ? "…" : ""}${characters.slice(start, end).join("")}${end < characters.length ? "…" : ""}`;
}
/**
* 找会话内第一条命中的候选。
* @returns 命中的摘要与时间；未命中返回 undefined。
*/
function nextHitInSession(events, needle, snippetRadius) {
	const candidates = [];
	let pendingAssistant;
	const flushAssistant = () => {
		if (pendingAssistant !== void 0) candidates.push(pendingAssistant);
		pendingAssistant = void 0;
	};
	for (const event of events) {
		if (event.type === "turn/end") {
			flushAssistant();
			continue;
		}
		const text = eventText(event);
		if (text === void 0 || text.length === 0) continue;
		if (event.type === "assistant/message") {
			pendingAssistant = {
				text,
				time: event.time
			};
			continue;
		}
		flushAssistant();
		candidates.push({
			text,
			time: event.time
		});
	}
	flushAssistant();
	for (const candidate of candidates) {
		const index = candidate.text.toLowerCase().indexOf(needle);
		if (index >= 0) return {
			snippet: makeSnippet(candidate.text, index, snippetRadius),
			time: candidate.time
		};
	}
}
//#endregion
//#region src/index.ts
/** 单次 RPC 最多扫描的会话数（客户端串行拉取，天然限流 CPU）。 */
const BATCH_SESSIONS = 3;
/** 会话快照缓存有效期：同查询分批期间保持一致的扫描顺序。 */
const SNAPSHOT_TTL_MS = 6e4;
/** 摘要窗口：以命中位置为中心的前后码点数。 */
const SNIPPET_RADIUS = 60;
var JxSearchGateway = class extends TypertRemoteService {
	static inject = ["sessionQuery", "workspaceRegistry"];
	snapshot;
	constructor(ctx) {
		super(ctx, "jxSearch");
	}
	/** 宿主 workspaceRegistry 的归档集合（registry 不可用时视为无归档）。 */
	archivedSessionIds() {
		const registry = this.ctx.workspaceRegistry;
		return registry === void 0 ? [] : [...registry.archivedSessionIds ?? []];
	}
	/**
	* 逐字扫描一批会话（每会话命中即止）。
	* @param query 非空搜索词（大小写不敏感子串）。
	* @param cursor 游标：空串从头开始；否则继续上一批。
	*/
	async search(query, cursor) {
		const needle = query.trim().toLowerCase();
		if (needle === "") return {
			hits: [],
			nextCursor: ""
		};
		const sessionQuery = this.ctx.sessionQuery;
		if (this.snapshot === void 0 || this.snapshot.query !== needle || Date.now() - this.snapshot.at > SNAPSHOT_TTL_MS) {
			const records = await sessionQuery.listSessions();
			const archived = new Set(this.archivedSessionIds());
			this.snapshot = {
				query: needle,
				ids: sessionScanOrder(records.map((record) => ({
					id: record.header.id,
					cwd: record.header.cwd
				}))).filter((id) => !archived.has(id)),
				at: Date.now()
			};
		}
		const ids = this.snapshot.ids;
		let offset = cursor === "" ? 0 : Number.parseInt(cursor, 10);
		if (!Number.isInteger(offset) || offset < 0 || offset > ids.length) offset = 0;
		const hits = [];
		let scanned = 0;
		while (offset < ids.length && scanned < BATCH_SESSIONS) {
			const sessionId = ids[offset];
			offset++;
			scanned++;
			let events;
			try {
				events = (await sessionQuery.readSession(sessionId)).events;
			} catch {
				continue;
			}
			const hit = nextHitInSession(events, needle, SNIPPET_RADIUS);
			if (hit !== void 0) hits.push({
				sessionId,
				snippet: hit.snippet,
				time: hit.time
			});
			await new Promise((resolve) => {
				setImmediate(resolve);
			});
		}
		return {
			hits,
			nextCursor: offset < ids.length ? String(offset) : ""
		};
	}
};
Object.defineProperty(JxSearchGateway.prototype, "@deepseek-ai/dsh-typert-protocol/remote-methods", {
	configurable: true,
	value: Object.freeze({
		version: 1,
		methods: Object.freeze([{
			method: "search",
			invocation: Object.freeze({ kind: "direct" })
		}])
	})
});
//#endregion
export { JxSearchGateway, JxSearchGateway as default };
