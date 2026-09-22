/**
 * 中途切换预设 —— 浏览器半边（坚祥定制）。
 *
 * 输入框左侧的模式药丸：显示当前预设，菜单列出健康预设，选择后走宿主
 * jxPreset/switch 强切（官方 select 对已开谈会话会拒绝）。
 * 结构沿用 dsh-mod-manager 验证过的模式：顶层 $mount 自有命名空间，
 * 子插件（inject remote.jxPreset）注册槽；session 槽的 inject 工厂收 sessionId。
 *
 * 外观复用官方原生：本药丸与官方新会话界面的「代理预设」芯片
 * （packages/client/ui-agent-preset/src/client/AgentPresetSeat）是同一个控件
 * ——同样的图标 + 名称 + 箭头、同样的 Menu 行结构——因此芯片与菜单行的样式
 * 逐条照搬那边（见 SEAT_STYLE），官方长什么样这里就长什么样。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { useEffect, useState, type ReactNode } from 'react'
import {
  Menu,
  IconAgentPresetOutline16,
  IconChevronDownOutline14,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'

// —— 结构化类型（仅类型，构建时擦除） ——

type RemoteResult<T> = { ok: true, value: T } | { ok: false, error: { code: string, message: string } }
interface PresetRow {
  id: string
  trust: 'system' | 'user'
  isDefault?: boolean
  name?: string
  description?: string
  broken?: string
}
interface SessionsState {
  current?: string
  byId?: Record<string, { running?: boolean; projectionValues?: { agentPreset?: string } }>
}

// —— 手写 jxPreset Remote 贡献（与官方 typert.remote-client 生成工件同构） ——

const TYPERT_REMOTE = {
  package: 'dsh-mode-switch',
  descriptors: [
    {
      id: 'dsh-mode-switch#jxPreset/switch',
      service: 'jxPreset',
      namespace: 'jxPreset',
      method: 'switch',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'sessionId',
          wire: 'sessionId',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-mode-switch#jxPreset/switch:sessionId', create: () => z.string() },
        },
        {
          name: 'agentPreset',
          wire: 'agentPreset',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-mode-switch#jxPreset/switch:agentPreset', create: () => z.string() },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-mode-switch#jxPreset/switch:result',
        create: () => z.string(),
      },
      sourceLocation: { file: 'src/index.ts', line: 1, column: 3 },
    },
  ],
}

// —— 模式药丸组件 ——

interface SwitchState {
  options: PresetRow[]
  busy: boolean
  error: string | null
}

/**
 * 药丸与菜单行样式：取值逐条来自官方 AgentPresetSeat.module.css，
 * 类名加 `jx-ms-` 前缀（插件不能引官方包的 CSS Module，行内样式又表达不了
 * hover / :disabled / 展开态，故整表挂进 document.head 一次）。
 */
const SEAT_STYLE = `
.jx-ms-anchor{min-width:54px;max-width:100%}
.jx-ms-seat{display:inline-flex;align-items:center;gap:4px;min-width:0;max-width:min(100%,240px);min-height:28px;padding:0 8px;border:none;border-radius:16px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;font-weight:500;white-space:nowrap;cursor:pointer}
.jx-ms-seat:not(:disabled):hover,.jx-ms-seat[aria-expanded='true']{background:var(--dsw-alias-interactive-bg-hover)}
.jx-ms-seat:disabled{cursor:default;color:var(--dsw-alias-label-quaternary)}
.jx-ms-seat-icon{flex:none;color:var(--dsw-alias-label-primary)}
.jx-ms-seat-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jx-ms-chevron{flex:none;color:var(--dsw-alias-label-caption);transition:transform 120ms ease}
.jx-ms-chevron-open{transform:rotate(180deg)}
.jx-ms-item{display:flex;flex-direction:column;gap:2px;max-width:280px}
.jx-ms-item-name{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.jx-ms-item-desc{font-size:12px;line-height:16px;color:var(--dsw-alias-label-caption);white-space:normal}
`

function presetName(option: PresetRow): string {
  return option.name ?? option.id
}

export function ModeSwitchButton({
  sessionId, useSessions, useModeSwitch, load, select,
}: {
  sessionId?: string
  useSessions: <T>(select: (state: SessionsState) => T) => T
  useModeSwitch: (select: (snapshot: SwitchState) => SwitchState) => SwitchState
  load: () => Promise<void>
  select: (id: string) => Promise<void>
}): ReactNode {
  const state = useModeSwitch(snapshot => snapshot)
  const current = useSessions(sessions =>
    sessionId === undefined ? undefined : sessions.byId?.[sessionId]?.projectionValues?.agentPreset)
  const running = useSessions(sessions =>
    sessionId === undefined ? false : sessions.byId?.[sessionId]?.running === true)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  // 数字助理的主对话不需要切模式（它只负责分发任务），别在那里显示这个药丸。
  // 会话 id 由模组 dsh-digital-assistant 固定；见《修改记录》条目 79。
  if (sessionId === 'session-jx-assistant') return null

  if (state.options.length === 0) return null

  const currentOption = state.options.find(option => option.id === current)
  const label = currentOption === undefined ? current : presetName(currentOption)
  if (label === undefined) return null

  const disabled = state.busy || running
  // 菜单行与官方一致：名称一行、灰色小字描述一行（官方 AgentPresetSeat 的
  // 行结构），短到一行装不下时说明文字自行折行，不再挤成一个「名 — 描述」长串。
  const items: MenuEntry[] = state.options.map(option => ({
    id: option.id,
    label: (
      <span className="jx-ms-item">
        <span className="jx-ms-item-name">{presetName(option)}</span>
        {option.description === undefined || option.description === ''
          ? null
          : <span className="jx-ms-item-desc">{option.description}</span>}
      </span>
    ),
  }))
  const triggerTitle = state.error ?? '切换当前会话的工作模式'

  return (
    <Menu
      open={open}
      items={items}
      selectedId={current}
      onSelect={(id: string) => {
        setOpen(false)
        void select(id)
      }}
      onClose={() => { setOpen(false) }}
      side="top"
      align="start"
      portal
      className="jx-ms-anchor"
      anchor={(
        <button
          type="button"
          className="jx-ms-seat"
          aria-label={`切换工作模式，当前 ${label}`}
          aria-haspopup="menu"
          aria-expanded={open}
          title={triggerTitle}
          disabled={disabled}
          onClick={() => { setOpen(value => !value) }}
        >
          <IconAgentPresetOutline16 className="jx-ms-seat-icon" />
          <span className="jx-ms-seat-label">{label}</span>
          <IconChevronDownOutline14
            className={open ? 'jx-ms-chevron jx-ms-chevron-open' : 'jx-ms-chevron'}
          />
        </button>
      )}
    />
  )
}

// —— 控制器（roster 读取 + 强切写路径） ——

interface AgentPresetsRemoteFace {
  list(): Promise<RemoteResult<{ presets: PresetRow[] }>>
}
interface JxPresetRemoteFace {
  switch(sessionId: string, agentPreset: string): Promise<RemoteResult<string>>
}

class ModeSwitchController {
  private state: SwitchState = { options: [], busy: false, error: null }
  private readonly listeners = new Set<() => void>()
  private roster: PresetRow[] | null = null

  constructor(
    private readonly agentPresets: AgentPresetsRemoteFace,
    private readonly jxPreset: JxPresetRemoteFace,
  ) {}

  readonly source = {
    getSnapshot: (): SwitchState => this.state,
    subscribe: (fn: () => void): (() => void) => {
      this.listeners.add(fn)
      return () => { this.listeners.delete(fn) }
    },
  }

  private publish(): void {
    this.state = { ...this.state }
    for (const fn of [...this.listeners]) fn()
  }

  async load(): Promise<void> {
    if (this.roster !== null) return
    try {
      const result = await this.agentPresets.list()
      if (!result.ok) {
        this.state = { ...this.state, error: result.error.message }
        this.publish()
        return
      }
      this.roster = result.value.presets.filter(preset => preset.broken === undefined)
      this.state = { options: this.roster, busy: false, error: null }
      this.publish()
    } catch (error) {
      this.state = { ...this.state, error: error instanceof Error ? error.message : String(error) }
      this.publish()
    }
  }

  async select(sessionId: string, id: string): Promise<void> {
    if (this.state.busy) return
    this.state = { ...this.state, busy: true, error: null }
    this.publish()
    try {
      const result = await this.jxPreset.switch(sessionId, id)
      this.state = { ...this.state, busy: false, error: result.ok ? null : result.error.message }
    } catch (error) {
      this.state = { ...this.state, busy: false, error: error instanceof Error ? error.message : String(error) }
    }
    this.publish()
  }
}

// —— 客户端入口 ——

export const inject = ['remote']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  // 样式先挂进 document.head：药丸未挂载的会话（无预设）也有样式，反复挂载
  // 卸载只留一份；fiber 拆除时随 effect 一起撤掉。
  const disposeStyle = ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.jxModeSwitch = 'seat'
    style.textContent = SEAT_STYLE
    document.head.append(style)
    return () => { style.remove() }
  }, 'dsh-mode-switch: native seat styles')

  const disposeMount = await ctx.remote.$mount(TYPERT_REMOTE)

  const disposeButton = ctx.plugin({
    name: 'dsh-mode-switch/button',
    inject: ['slots', 'remote.jxPreset', 'remote.agentPresets'],
    apply(child: ClientContext) {
      const remote = (child as unknown as {
        remote: { jxPreset: JxPresetRemoteFace, agentPresets: AgentPresetsRemoteFace }
      }).remote
      const controller = new ModeSwitchController(remote.agentPresets, remote.jxPreset)

      child.slots.inject('conversation.input.left', () => child.slots.register({
        name: 'conversation.input.left',
        id: 'mode-switch',
        order: 0,
        inject: (sessionId: string) => ({
          hooks: { modeSwitch: controller.source },
          load: async () => { await controller.load() },
          select: async (id: string) => { await controller.select(sessionId, id) },
        }),
      }, ModeSwitchButton as (props: Record<string, unknown>) => unknown))
    },
  })

  return async () => {
    await disposeButton()
    await disposeMount()
    await disposeStyle()
  }
}
