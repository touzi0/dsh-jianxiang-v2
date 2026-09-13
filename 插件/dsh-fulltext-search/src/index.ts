/**
 * 坚祥聊天记录逐字搜索 —— 宿主半边。
 * jxSearch Remote：绕开官方 FTS 分词，按会话批量逐字（子串）扫描，
 * 只搜真人发送的消息（data.source.kind === 'user'）与每轮模型的最终回答
 * （每轮最后一个 assistant/message，跳过思考/工具调用/中间返回）；
 * 每会话命中一条即止，客户端按游标分批拉取、渐进呈现（微信式）。
 * 读取走官方 ctx.sessionQuery.readSession（openAt: never 下也可用的冷读通道）。
 */
import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { nextHitInSession, sessionScanOrder } from './scan.ts'

/** 单次 RPC 最多扫描的会话数（客户端串行拉取，天然限流 CPU）。 */
const BATCH_SESSIONS = 3
/** 会话快照缓存有效期：同查询分批期间保持一致的扫描顺序。 */
const SNAPSHOT_TTL_MS = 60_000
/** 摘要窗口：以命中位置为中心的前后码点数。 */
const SNIPPET_RADIUS = 60

interface LooseEvent {
  readonly type: string
  readonly time: number
  readonly data: unknown
}

interface LooseSessionQuery {
  listSessions(signal?: AbortSignal): Promise<Array<{ header: { id: string, cwd?: string } }>>
  readSession(sessionId: string): Promise<{ events: readonly LooseEvent[] }>
}

export interface JxSearchHit {
  sessionId: string
  snippet: string
  time: number
}

export interface JxSearchPage {
  hits: JxSearchHit[]
  /** 下一批游标；空串表示扫描完成。 */
  nextCursor: string
}

export class JxSearchGateway extends TypertRemoteService {
  static inject = ['sessionQuery']

  private snapshot: { query: string, ids: string[], at: number } | undefined

  constructor(ctx: Context) {
    super(ctx, 'jxSearch')
    void ctx
  }

  /**
   * 逐字扫描一批会话（每会话命中即止）。
   * @param query 非空搜索词（大小写不敏感子串）。
   * @param cursor 游标：空串从头开始；否则继续上一批。
   */
  async search(query: string, cursor: string): Promise<JxSearchPage> {
    const needle = query.trim().toLowerCase()
    if (needle === '') return { hits: [], nextCursor: '' }

    const sessionQuery = (this.ctx as unknown as { sessionQuery: LooseSessionQuery }).sessionQuery
    if (this.snapshot === undefined || this.snapshot.query !== needle || Date.now() - this.snapshot.at > SNAPSHOT_TTL_MS) {
      const records = await sessionQuery.listSessions()
      // 镜像官方搜索的可见性授权：只扫有 cwd 的会话；官方 listSessions 已按最新在前排序。
      this.snapshot = {
        query: needle,
        ids: sessionScanOrder(records.map(record => ({ id: record.header.id, cwd: record.header.cwd }))),
        at: Date.now(),
      }
    }
    const ids = this.snapshot.ids
    let offset = cursor === '' ? 0 : Number.parseInt(cursor, 10)
    if (!Number.isInteger(offset) || offset < 0 || offset > ids.length) offset = 0

    const hits: JxSearchHit[] = []
    let scanned = 0
    while (offset < ids.length && scanned < BATCH_SESSIONS) {
      const sessionId = ids[offset]
      offset++
      scanned++
      let events: readonly LooseEvent[]
      try {
        events = (await sessionQuery.readSession(sessionId)).events
      } catch {
        continue // 冷读失败（损坏/被清理）的会话跳过，不拖垮整批。
      }
      const hit = nextHitInSession(events, needle, SNIPPET_RADIUS)
      if (hit !== undefined) hits.push({ sessionId, snippet: hit.snippet, time: hit.time })
      // 会话之间让出事件循环，避免连续冷读占满 CPU。
      await new Promise<void>(resolve => { setImmediate(resolve) })
    }
    return { hits, nextCursor: offset < ids.length ? String(offset) : '' }
  }
}

// typert-protocol 的远程方法标记（等价 @Remote('search')，外部包不用装饰器语法）。
const REMOTE_METHODS_KEY = '@deepseek-ai/dsh-typert-protocol/remote-methods'
Object.defineProperty(JxSearchGateway.prototype, REMOTE_METHODS_KEY, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([
      { method: 'search', invocation: Object.freeze({ kind: 'direct' }) },
    ]),
  }),
})

export default JxSearchGateway
