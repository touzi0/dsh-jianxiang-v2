/**
 * 中途切换预设 —— 浏览器半边（坚祥定制）。
 *
 * 输入框左侧的模式药丸：显示当前预设，菜单列出健康预设，选择后走宿主
 * jxPreset/switch 强切（官方 select 对已开谈会话会拒绝）。
 * 结构沿用 dsh-mod-manager 验证过的模式：顶层 $mount 自有命名空间，
 * 子插件（inject remote.jxPreset）注册槽；session 槽的 inject 工厂收 sessionId。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
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

const styles = {
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    border: '1px solid color-mix(in srgb, currentColor 20%, transparent)',
    borderRadius: 999,
    background: 'transparent',
    color: 'inherit',
    padding: '3px 10px',
    fontSize: 13,
    lineHeight: '20px',
    cursor: 'pointer',
  } satisfies CSSProperties,
  icon: { display: 'inline-flex', alignItems: 'center' } satisfies CSSProperties,
  chevronOpen: { transform: 'rotate(180deg)' } satisfies CSSProperties,
} as const

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

  if (state.options.length === 0) return null

  const currentOption = state.options.find(option => option.id === current)
  const label = currentOption === undefined ? current : presetName(currentOption)
  if (label === undefined) return null

  const disabled = state.busy || running
  const items: MenuEntry[] = state.options.map(option => ({
    id: option.id,
    label: option.description === undefined
      ? presetName(option)
      : `${presetName(option)} — ${option.description}`,
  }))

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
      anchor={(
        <button
          type="button"
          style={{
            ...styles.trigger,
            ...(disabled ? { opacity: 0.5, cursor: 'default' } satisfies CSSProperties : {}),
          }}
          aria-label={`切换工作模式，当前 ${label}`}
          aria-haspopup="menu"
          aria-expanded={open}
          title={state.error ?? '切换当前会话的工作模式'}
          disabled={disabled}
          onClick={() => { setOpen(value => !value) }}
        >
          <span style={styles.icon} aria-hidden><IconAgentPresetOutline16 /></span>
          <span>{label}</span>
          <span style={{ ...styles.icon, ...(open ? styles.chevronOpen : {}) }} aria-hidden>
            <IconChevronDownOutline14 />
          </span>
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
  }
}
