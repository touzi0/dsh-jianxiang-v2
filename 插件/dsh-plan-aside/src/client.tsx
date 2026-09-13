/**
 * 坚祥计划查阅 —— 浏览器半边。
 * 官方审阅弹窗不动；在右侧栏注册「计划」页面型标签（sidebarRightTabs 扩展带）：
 * 待审计划置顶全文 + 历史清单点选回看；计划挂起时自动打开标签。
 * 服务经 register 的 inject 工厂平铺为组件顶层 props（框架既有行为）。
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { IconListPenOutline16, MarkdownText, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { TYPERT_REMOTE } from './remote-client.ts'

const MOD_ID = 'dsh-plan-aside'
const PLAN_KIND = 'jx-plan'

/** 官方服务的最小使用面（duck-typed）。 */
interface SessionsFace {
  list: { getSnapshot(): { current?: string }, subscribe(fn: () => void): () => void }
}
interface UiSessionFace {
  pendingInteractions: {
    getSnapshot(): ReadonlyMap<string, { kind: string, key: string, sessionId: string, questions?: unknown[] }>
    subscribe(fn: () => void): () => void
  }
}
interface SidebarRightFace {
  openTab(kind: string): void
}
interface TabsRegistryFace {
  register(definition: { id: string, kind: string, priority: 'extension', title: () => string }): () => void
}
type RemoteResult<T> = { ok: true, value: T } | { ok: false, error: { code: string, message: string } }
interface JxPlansFace {
  list(sessionId: string): Promise<RemoteResult<{ plans: readonly JxPlanView[] }>>
}
interface JxPlanView {
  seq: number
  time: number
  plan: string
  status: 'approved' | 'rejected' | 'pending'
  file: string
}

const text = {
  tabTitle: '计划',
  pendingBadge: '待审阅',
  pendingHint: '计划全文已同步到此；请在对话区的弹窗中批准或拒绝。',
  approved: '已批准',
  rejected: '已拒绝',
  history: '历史计划',
  empty: '本会话还没有提交过计划。',
  loading: '读取计划…',
  error: '计划读取失败',
  filePath: '文件',
  collapse: '收起',
} as const

const statusTone: Record<JxPlanView['status'], TagTone> = { approved: 'success', rejected: 'danger', pending: 'warning' }

function planTitle(plan: string): string {
  return plan.split('\n')[0]?.replace(/^#\s*/, '').trim() || '（未命名计划）'
}

function timeLabel(time: number): string {
  if (time <= 0) return ''
  const d = new Date(time)
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 从 pendingInteraction 里抽取待审计划全文（官方 planReviewOf 的鸭子类型版）。 */
function pendingPlanOf(interaction: { kind: string, questions?: unknown[] } | undefined): string | undefined {
  if (interaction === undefined || interaction.kind !== 'plan-review') return undefined
  const question = interaction.questions?.[0] as { intent?: { kind?: string }, detail?: unknown } | undefined
  if (question === undefined || question.intent?.kind !== 'plan-review') return undefined
  return typeof question.detail === 'string' && question.detail.trim() !== '' ? question.detail : undefined
}

interface PlanBodyProps {
  sessions: SessionsFace
  uiSession: UiSessionFace
  jxPlans: JxPlansFace
}

/** 「计划」标签页主体。 */
function PlanBody({ sessions, uiSession, jxPlans }: PlanBodyProps): ReactNode {
  const listState = useSyncExternalStore(sessions.list.subscribe, sessions.list.getSnapshot)
  const sessionId = listState.current
  const pendingMap = useSyncExternalStore(uiSession.pendingInteractions.subscribe, uiSession.pendingInteractions.getSnapshot)
  const interaction = sessionId === undefined ? undefined : pendingMap.get(sessionId)
  const pendingPlan = pendingPlanOf(interaction)
  const pendingActive = pendingPlan !== undefined

  const [plans, setPlans] = useState<readonly JxPlanView[]>([])
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null)
  const [settleTick, setSettleTick] = useState(0)
  const prevActive = useRef(false)

  // 待审结算（有→无）时 bump 一次，驱动重新拉取以拿到最新状态。
  useEffect(() => {
    if (prevActive.current && !pendingActive) setSettleTick(tick => tick + 1)
    prevActive.current = pendingActive
  }, [pendingActive])

  useEffect(() => {
    if (sessionId === undefined) {
      setPlans([])
      setPhase('ready')
      return
    }
    let cancelled = false
    setPhase('loading')
    jxPlans.list(sessionId)
      .then(result => {
        if (cancelled) return
        if (!result.ok) {
          setPhase('error')
          return
        }
        setPlans(result.value.plans)
        setPhase('ready')
      })
      .catch(() => { if (!cancelled) setPhase('error') })
    return () => { cancelled = true }
  }, [sessionId, jxPlans, pendingActive, settleTick])

  const markdownLabels = useMemo(() => ({
    code: { copyLabel: '复制', copiedLabel: '已复制' },
    footnotes: '脚注',
  }), [])

  // 待审全文：优先用已入库的 pending 记录（带状态/文件），入库前先显示实时全文。
  const pendingRecord = plans.find(p => p.status === 'pending')
  const effectivePending = pendingRecord ?? (pendingActive ? { seq: -1, time: 0, plan: pendingPlan, status: 'pending' as const, file: '' } : undefined)

  const selected = useMemo(() => {
    if (selectedSeq !== null) return plans.find(p => p.seq === selectedSeq) ?? null
    return plans[0] ?? null
  }, [plans, selectedSeq])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      {effectivePending !== undefined
        ? (
          <section style={{ borderBottom: '1px solid color-mix(in srgb, CanvasText 10%, transparent)', padding: '8px 12px 10px' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
              <Tag tone="warning">{text.pendingBadge}</Tag>
              {effectivePending.time > 0 ? <span style={{ fontSize: 11, opacity: 0.6 }}>{timeLabel(effectivePending.time)}</span> : null}
            </div>
            <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 6 }}>{text.pendingHint}</div>
            <div style={{ overflowY: 'auto', maxHeight: '35vh', fontSize: 13 }}>
              <MarkdownText text={effectivePending.plan} labels={markdownLabels} />
            </div>
          </section>
        )
        : null}
      <div style={{ padding: '8px 12px 4px', fontSize: 11, opacity: 0.55, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {text.history}
      </div>
      {phase === 'loading' ? <div style={{ padding: '4px 12px', fontSize: 12, opacity: 0.6 }}>{text.loading}</div> : null}
      {phase === 'error' ? <div style={{ padding: '4px 12px', fontSize: 12, color: 'var(--dsw-alias-state-error-primary, red)' }}>{text.error}</div> : null}
      {phase === 'ready' && plans.length === 0 && effectivePending === undefined
        ? <div style={{ padding: '4px 12px', fontSize: 12, opacity: 0.6 }}>{text.empty}</div>
        : null}
      {phase === 'ready'
        ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: '0 6px 8px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minHeight: 0 }}>
            {plans.map(plan => (
              <li key={plan.seq}>
                <button
                  type="button"
                  onClick={() => { setSelectedSeq(plan.seq) }}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 3, width: '100%', textAlign: 'left',
                    padding: '6px 8px', borderRadius: 8, cursor: 'pointer', background: 'transparent',
                    border: selected?.seq === plan.seq ? '1px solid color-mix(in srgb, CanvasText 22%, transparent)' : '1px solid transparent',
                    color: 'inherit',
                  }}
                >
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Tag tone={statusTone[plan.status]}>
                      {plan.status === 'approved' ? text.approved : plan.status === 'rejected' ? text.rejected : text.pendingBadge}
                    </Tag>
                    <span style={{ fontSize: 11, opacity: 0.6 }}>{timeLabel(plan.time)}</span>
                  </span>
                  <span style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {planTitle(plan.plan)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
        : null}
      {selected !== null
        ? (
          <section style={{ borderTop: '1px solid color-mix(in srgb, CanvasText 10%, transparent)', padding: '8px 12px 10px', minHeight: 0, overflowY: 'auto', flex: selectedSeq !== null ? 1 : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Tag tone={statusTone[selected.status]}>
                  {selected.status === 'approved' ? text.approved : selected.status === 'rejected' ? text.rejected : text.pendingBadge}
                </Tag>
                <span style={{ fontSize: 11, opacity: 0.6 }}>{timeLabel(selected.time)}</span>
              </span>
              {selectedSeq !== null
                ? (
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 11, opacity: 0.7 }}
                    onClick={() => { setSelectedSeq(null) }}
                  >
                    {text.collapse}
                  </button>
                )
                : null}
            </div>
            <div style={{ fontSize: 13 }}>
              <MarkdownText text={selected.plan} labels={markdownLabels} />
            </div>
            {selected.file !== ''
              ? (
                <div style={{ marginTop: 8, fontSize: 11, opacity: 0.6, wordBreak: 'break-all' }}>
                  {text.filePath}: <code>{selected.file}</code>
                </div>
              )
              : null}
          </section>
        )
        : null}
    </div>
  )
}

/** 「计划」标签标题。 */
function PlanTitle(): ReactNode {
  return <span style={{ fontSize: 12 }}>{text.tabTitle}</span>
}

/** 会话头部工具区的「计划」入口按钮（打开右侧计划标签）。 */
function PlanHeaderButton({ openPlan }: { openPlan: () => void }): ReactNode {
  return (
    <button
      type="button"
      aria-label={text.tabTitle}
      title={text.tabTitle}
      onClick={openPlan}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer',
        background: 'transparent', color: 'inherit', opacity: 0.75,
      }}
    >
      <IconListPenOutline16 />
    </button>
  )
}

/** 顶层：挂 jxPlans Remote；子插件注册右侧标签并监听待审计划自动打开。 */
export const inject = ['remote']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeMount = await ctx.remote.$mount(TYPERT_REMOTE)

  const disposeChild = ctx.plugin({
    name: 'dsh-plan-aside/tab',
    inject: ['slots', 'sessions', 'uiSession', 'sidebarRight', 'sidebarRightTabs', 'remote.jxPlans'],
    apply(child: ClientContext) {
      const sessions = (child as unknown as { sessions: SessionsFace }).sessions
      const uiSession = (child as unknown as { uiSession: UiSessionFace }).uiSession
      const sidebarRight = (child as unknown as { sidebarRight: SidebarRightFace }).sidebarRight
      const tabs = (child as unknown as { sidebarRightTabs: TabsRegistryFace }).sidebarRightTabs
      const jxPlans = (child as unknown as { remote: { jxPlans: JxPlansFace } }).remote.jxPlans

      const disposeType = tabs.register({
        id: MOD_ID,
        kind: PLAN_KIND,
        priority: 'extension',
        title: () => text.tabTitle,
      })
      const disposeBody = child.slots.inject('sidebar.right.pane.tab', () => child.slots.register(
        {
          name: 'sidebar.right.pane.tab',
          key: MOD_ID,
          inject: () => ({ sessions, uiSession, jxPlans }),
        },
        PlanBody,
      ))
      const disposeTitle = child.slots.inject('sidebar.right.pane.tab.title', () => child.slots.register(
        { name: 'sidebar.right.pane.tab.title', key: MOD_ID },
        PlanTitle,
      ))
      // 手动入口：会话头部工具区的「计划」按钮。
      const disposeHeader = child.slots.inject('conversation.session.header.utilities', () => child.slots.register(
        {
          name: 'conversation.session.header.utilities',
          id: 'jx-plan-open',
          order: 50,
          inject: () => ({ openPlan: () => { sidebarRight.openTab(PLAN_KIND) } }),
        },
        PlanHeaderButton,
      ))

      // 计划挂起 → 自动打开「计划」标签（只在出现的那一刻触发一次）。
      let lastPendingKey = ''
      const sync = (): void => {
        const current = sessions.list.getSnapshot().current
        const interaction = current === undefined ? undefined : uiSession.pendingInteractions.getSnapshot().get(current)
        const key = interaction !== undefined && interaction.kind === 'plan-review' ? interaction.key : ''
        if (key !== '' && lastPendingKey === '') sidebarRight.openTab(PLAN_KIND)
        lastPendingKey = key
      }
      child.effect(() => {
        const unsubscribePending = uiSession.pendingInteractions.subscribe(sync)
        const unsubscribeSessions = sessions.list.subscribe(sync)
        sync()
        return () => { unsubscribePending(); unsubscribeSessions() }
      }, 'dsh-plan-aside: auto-open')
    },
  })

  return async () => {
    await disposeChild()
    await disposeMount()
  }
}
