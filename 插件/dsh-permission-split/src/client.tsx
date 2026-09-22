/**
 * dsh-permission-split —— 浏览器半边（坚祥定制）。
 *
 * 权限菜单两列化。官方 `ui-permission` 那一行已被 `jx.replaces` 禁用，
 * 于是 slot `conversation.input.permission` 归本模组，**不改官方源码**。
 *
 * 结构沿用模组 `dsh-mode-switch` 验证过的模式：
 *   顶层 apply 挂样式与手写 Remote 贡献 → 子插件注册 slot。
 *
 * 两列：
 *   左列 —— 官方预设（沙箱模式 × 审批策略），写路径照搬官方 `PermissionSelect`：
 *           点击提交 `/permission <preset>` 命令行。
 *   右列 —— 三项能力授权，方框多选；读写走本模组的 `jxPermission` Remote。
 *
 * 外观：只出现官方那一颗胶囊（trigger 样式照搬官方
 * `PermissionSelect.module.css`），点开是两列弹层。设计 token 一律 `--dsw-*`。
 *
 * 响应式：控制器状态经 `hooks` 舱（裸 observable）交给渲染器绑成
 * `usePermissionSplit`，组件只读 hook，不自建订阅（客户端规范第 4/8 条）。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { useEffect, useState, type ReactNode } from 'react'
import { IconChevronDownOutline14, SHIELD_OUTLINE_PATH, SHIELD_OUTLINE_STROKE } from '@deepseek-ai/dsh-client-ui-primitives'

// —— 结构化类型（仅类型，构建时擦除） ——

type RemoteResult<T> = { ok: true, value: T } | { ok: false, error: { code: string, message: string } }
type Capability = 'browser' | 'computer' | 'shell'
type Grants = Record<Capability, boolean>

interface PresetOption { value: string, name: string, description?: string }
interface CatalogFace { list(): Promise<RemoteResult<{ options: PresetOption[] }>> }
interface JxPermissionFace {
  get(sessionId: string): Promise<RemoteResult<Grants>>
  set(sessionId: string, capability: string, granted: boolean): Promise<RemoteResult<Grants>>
}
interface SessionLikeFace { command(line: string): Promise<RemoteResult<{ matched: boolean }>> }
interface SessionsFace { binding(sessionId: string): { session?: SessionLikeFace } | undefined }

// —— 手写 Remote 贡献（与官方 typert.remote-client 生成工件同构） ——

/**
 * 轻量 schema 占位，**刻意不依赖 zod**。
 *
 * 这里的 codec 描述的是同一进程内的直调边界，跨过的只是普通 JSON
 * （string / boolean / Record<string, boolean>）；真正严格的校验由宿主侧
 * 由真实 codec 负责。踩过的坑：先前用 zod 并在打包时把它列为 external，
 * 产物里出现 `require("zod")`，而 Web shell 的模块表**不提供 zod**，
 * 浏览器加载本插件时 require 直接抛错。对照可正常工作的 `dsh-mode-switch`：
 * 它虽然用了 zod，但**把 zod 打进产物**，不向模块表请求。
 */
interface LightSchema {
  readonly kind: 'string' | 'boolean' | 'booleanRecord'
  readonly typeSymbol: string
  parse(value: unknown): unknown
}

const lightSchema = (typeSymbol: string, kind: LightSchema['kind']): LightSchema => ({
  kind,
  typeSymbol,
  parse(value: unknown): unknown {
    if (kind === 'booleanRecord') return value
    return value
  },
})

const jsonCodec = (typeSymbol: string, kind: LightSchema['kind']) => ({
  mode: 'strict' as const,
  typeSymbol,
  create: () => lightSchema(typeSymbol, kind),
})

const TYPERT_REMOTE = {
  package: 'dsh-permission-split',
  descriptors: [
    {
      id: 'dsh-permission-split#jxPermission/get',
      service: 'jxPermission',
      namespace: 'jxPermission',
      method: 'get',
      invocation: { kind: 'direct' },
      parameters: [{
        name: 'sessionId', wire: 'sessionId', source: 'json',
        codec: jsonCodec('dsh-permission-split#jxPermission/get:sessionId', 'string'),
      }],
      result: jsonCodec('dsh-permission-split#jxPermission/get:result', 'booleanRecord'),
      sourceLocation: { file: 'src/index.ts', line: 1, column: 3 },
    },
    {
      id: 'dsh-permission-split#jxPermission/set',
      service: 'jxPermission',
      namespace: 'jxPermission',
      method: 'set',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'sessionId', wire: 'sessionId', source: 'json',
          codec: jsonCodec('dsh-permission-split#jxPermission/set:sessionId', 'string'),
        },
        {
          name: 'capability', wire: 'capability', source: 'json',
          codec: jsonCodec('dsh-permission-split#jxPermission/set:capability', 'string'),
        },
        {
          name: 'granted', wire: 'granted', source: 'json',
          codec: jsonCodec('dsh-permission-split#jxPermission/set:granted', 'boolean'),
        },
      ],
      result: jsonCodec('dsh-permission-split#jxPermission/set:result', 'booleanRecord'),
      sourceLocation: { file: 'src/index.ts', line: 1, column: 3 },
    },
  ],
}

// —— 文案（插件自有命名空间） ——

const COPY = {
  zh: {
    title: '权限', aria: '权限，当前 {name}',
    presetsTitle: '权限模式', grantsTitle: '能力授权',
    browser: '允许操作浏览器', computer: '允许操作电脑', shell: '允许沙箱外执行命令程序',
    browserHint: '勾选后模型调用浏览器工具不再询问',
    computerHint: '勾选后模型操作鼠标键盘与屏幕不再询问',
    shellHint: '勾选后允许在沙箱外运行命令程序',
    failed: '操作失败',
  },
  en: {
    title: 'Permissions', aria: 'Permissions, currently {name}',
    presetsTitle: 'Mode', grantsTitle: 'Capabilities',
    browser: 'Operate the browser', computer: 'Operate the computer', shell: 'Run commands outside the sandbox',
    browserHint: 'Stop asking when the model drives the browser',
    computerHint: 'Stop asking when the model drives mouse, keyboard, or screen',
    shellHint: 'Allow command programs to run outside the sandbox',
    failed: 'Action failed',
  },
}

/** 胶囊与两列弹层样式：token 全部取官方 `--dsw-*`；trigger 照搬官方 PermissionSelect。 */
const STYLE = `
.jx-ps-anchor{position:relative;display:inline-flex}
.jx-ps-trigger{display:inline-flex;align-items:center;gap:4px;max-width:100%;min-height:28px;padding:0 8px;border:none;border-radius:16px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;font-weight:500;white-space:nowrap;cursor:pointer}
.jx-ps-trigger:not(:disabled):hover,.jx-ps-trigger[aria-expanded='true']{background:var(--dsw-alias-interactive-bg-hover)}
.jx-ps-trigger:disabled{cursor:default;color:var(--dsw-alias-label-quaternary)}
.jx-ps-trigger-icon{flex:none;display:inline-flex;color:var(--dsw-alias-label-primary)}
.jx-ps-chevron{flex:none;color:var(--dsw-alias-label-caption);transition:transform 120ms ease}
.jx-ps-chevron-open{transform:rotate(180deg)}
.jx-ps-panel{position:absolute;bottom:calc(100% + 6px);left:0;z-index:40;display:flex;align-items:flex-start;padding:4px;border:1px solid var(--dsw-alias-border-secondary);border-radius:12px;background:var(--dsw-alias-bg-elevated);box-shadow:0 8px 24px rgba(0,0,0,.12)}
.jx-ps-col{display:flex;flex-direction:column;gap:2px;padding:4px;min-width:200px;max-width:280px}
.jx-ps-col + .jx-ps-col{border-left:1px solid var(--dsw-alias-border-secondary)}
.jx-ps-head{padding:4px 8px 6px;font-size:12px;line-height:16px;color:var(--dsw-alias-label-caption)}
.jx-ps-row{display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border:none;border-radius:8px;background:transparent;text-align:left;cursor:pointer}
.jx-ps-row:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover)}
.jx-ps-row:disabled{cursor:default;opacity:.5}
.jx-ps-row-mark{flex:none;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;margin-top:2px;color:var(--dsw-alias-label-primary)}
.jx-ps-box{flex:none;width:14px;height:14px;margin-top:3px;border:1.5px solid var(--dsw-alias-border-secondary);border-radius:3px;background:transparent}
.jx-ps-box-on{border-color:var(--dsw-alias-label-primary);background:var(--dsw-alias-label-primary)}
.jx-ps-box-on::after{content:'';display:block;width:7px;height:3px;margin:2px 0 0 3px;border-left:1.5px solid var(--dsw-alias-bg-elevated);border-bottom:1.5px solid var(--dsw-alias-bg-elevated);transform:rotate(-45deg)}
.jx-ps-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.jx-ps-name{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.jx-ps-desc{font-size:12px;line-height:16px;color:var(--dsw-alias-label-caption);white-space:normal}
.jx-ps-err{padding:4px 8px;font-size:12px;line-height:16px;color:var(--dsw-alias-label-error)}
`

// —— 控制器：预设目录 + 授权读写 ——

interface SplitState {
  grants: Grants
  options: PresetOption[]
  current: string | undefined
  busy: boolean
  error: string | null
}

const NO_GRANTS: Grants = { browser: false, computer: false, shell: false }

class PermissionSplitController {
  private state: SplitState = { grants: { ...NO_GRANTS }, options: [], current: undefined, busy: false, error: null }
  private readonly listeners = new Set<() => void>()
  private loaded = false

  constructor(
    private readonly jxPermission: JxPermissionFace,
    private readonly catalog: CatalogFace,
  ) {}

  readonly source = {
    getSnapshot: (): SplitState => this.state,
    subscribe: (fn: () => void): (() => void) => {
      this.listeners.add(fn)
      return () => { this.listeners.delete(fn) }
    },
  }

  private publish(): void {
    this.state = { ...this.state }
    for (const fn of [...this.listeners]) fn()
  }

  /**
   * 读取当前授权与预设目录。目录是进程级不变的，只读一次。
   * @param sessionId - 目标会话。
   */
  async load(sessionId: string): Promise<void> {
    try {
      const grants = await this.jxPermission.get(sessionId)
      this.state = grants.ok
        ? { ...this.state, grants: grants.value, error: null }
        : { ...this.state, error: grants.error.message }
      this.publish()
      if (this.loaded) return
      this.loaded = true
      const catalog = await this.catalog.list()
      this.state = catalog.ok
        ? { ...this.state, options: catalog.value.options }
        : { ...this.state, error: catalog.error.message }
      this.publish()
    } catch (error) {
      this.state = { ...this.state, error: error instanceof Error ? error.message : String(error) }
      this.publish()
    }
  }

  /**
   * 改写一项能力授权。乐观置位，失败回滚。
   * @param sessionId - 目标会话。
   * @param capability - 能力。
   * @param granted - 目标状态。
   */
  async setGrant(sessionId: string, capability: Capability, granted: boolean): Promise<void> {
    if (this.state.busy) return
    const previous = this.state.grants
    this.state = { ...this.state, grants: { ...previous, [capability]: granted }, busy: true, error: null }
    this.publish()
    try {
      const result = await this.jxPermission.set(sessionId, capability, granted)
      this.state = {
        ...this.state, busy: false,
        grants: result.ok ? result.value : previous,
        error: result.ok ? null : result.error.message,
      }
    } catch (error) {
      this.state = {
        ...this.state, busy: false, grants: previous,
        error: error instanceof Error ? error.message : String(error),
      }
    }
    this.publish()
  }

  /**
   * 记录当前预设（由会话投影给出）。
   * @param current - 当前预设值。
   */
  setCurrent(current: string | undefined): void {
    if (this.state.current === current) return
    this.state = { ...this.state, current }
    this.publish()
  }
}

// —— 组件 ——

/** 组件从注入面与框架 hooks 收到的全部数据与回调。 */
export interface PermissionSplitProps {
  sessionId?: string
  usePermissionSplit: (select: (snapshot: SplitState) => SplitState) => SplitState
  t: (key: string, values?: Record<string, string>) => string
  load: () => Promise<void>
  selectPreset: (preset: string) => Promise<void>
  setGrant: (capability: Capability, granted: boolean) => Promise<void>
}

const CAPABILITY_ROWS: ReadonlyArray<[Capability, string, string]> = [
  ['browser', 'browser', 'browserHint'],
  ['computer', 'computer', 'computerHint'],
  ['shell', 'shell', 'shellHint'],
]

/**
 * 权限两列控件：左列官方预设单选，右列三项能力多选。
 * @param props - 注入面与框架 hooks 提供的 props。
 * @returns 胶囊触发器与两列弹层。
 */
export function PermissionSplit(props: PermissionSplitProps): ReactNode {
  const { sessionId, usePermissionSplit, t } = props
  const state = usePermissionSplit(snapshot => snapshot)
  const [open, setOpen] = useState(false)

  useEffect(() => { void props.load() }, [props.load])
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') setOpen(false) }
    const onDown = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.jx-ps-anchor') === null) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  // 会话未物化时不显示——没有会话就没有可切的权限。
  if (sessionId === undefined) return null

  const currentName = state.options.find(option => option.value === state.current)?.name
    ?? state.current ?? t('title')

  return (
    <span className="jx-ps-anchor">
      <button
        type="button"
        className="jx-ps-trigger"
        aria-label={t('aria', { name: currentName })}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={state.busy}
        onClick={() => { setOpen(value => !value) }}
      >
        <span className="jx-ps-trigger-icon" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d={SHIELD_OUTLINE_PATH} stroke="currentColor" strokeWidth={SHIELD_OUTLINE_STROKE} strokeLinejoin="round" />
          </svg>
        </span>
        <span>{currentName}</span>
        <IconChevronDownOutline14 className={open ? 'jx-ps-chevron jx-ps-chevron-open' : 'jx-ps-chevron'} />
      </button>

      {open && (
        <div className="jx-ps-panel" role="dialog" aria-label={t('title')}>
          <div className="jx-ps-col">
            <div className="jx-ps-head">{t('presetsTitle')}</div>
            {state.options.map(option => (
              <button
                key={option.value}
                type="button"
                className="jx-ps-row"
                disabled={state.busy}
                onClick={() => { void props.selectPreset(option.value) }}
              >
                <span className="jx-ps-row-mark" aria-hidden>
                  {option.value === state.current && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M12.1654 5.7552L8.9447 9.41475C8.73044 9.65816 8.53628 9.8804 8.35774 10.0423C8.1713 10.2114 7.94235 10.3717 7.64016 10.4254C7.48207 10.4535 7.32 10.4552 7.16151 10.4294C6.85843 10.3801 6.62728 10.2223 6.43836 10.0559C6.25752 9.89653 6.06037 9.67732 5.84264 9.43705L4.72925 8.20897L5.63557 7.38707L6.74897 8.61594C6.98603 8.87755 7.12974 9.03533 7.24673 9.13839C7.31033 9.19443 7.34485 9.21476 7.35823 9.22122C7.38068 9.22484 7.40352 9.22515 7.42593 9.22122C7.40522 9.22502 7.42893 9.23294 7.53583 9.136C7.65132 9.03126 7.79316 8.87139 8.02643 8.60638L11.2479 4.94763L12.1654 5.7552Z" fill="currentColor" />
                    </svg>
                  )}
                </span>
                <span className="jx-ps-text">
                  <span className="jx-ps-name">{option.name}</span>
                  {option.description !== undefined && option.description !== '' && (
                    <span className="jx-ps-desc">{option.description}</span>
                  )}
                </span>
              </button>
            ))}
          </div>

          <div className="jx-ps-col">
            <div className="jx-ps-head">{t('grantsTitle')}</div>
            {CAPABILITY_ROWS.map(([capability, nameKey, hintKey]) => (
              <button
                key={capability}
                type="button"
                role="checkbox"
                aria-checked={state.grants[capability]}
                className="jx-ps-row"
                disabled={state.busy}
                onClick={() => { void props.setGrant(capability, !state.grants[capability]) }}
              >
                <span className={state.grants[capability] ? 'jx-ps-box jx-ps-box-on' : 'jx-ps-box'} aria-hidden />
                <span className="jx-ps-text">
                  <span className="jx-ps-name">{t(nameKey)}</span>
                  <span className="jx-ps-desc">{t(hintKey)}</span>
                </span>
              </button>
            ))}
          </div>

          {state.error !== null && <div className="jx-ps-err">{t('failed')}: {state.error}</div>}
        </div>
      )}
    </span>
  )
}

// —— 客户端入口 ——

export const inject = ['remote']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeStyle = ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.jxPermissionSplit = 'panel'
    style.textContent = STYLE
    document.head.append(style)
    return () => { style.remove() }
  }, 'dsh-permission-split: two-column panel styles')

  const disposeMount = await ctx.remote.$mount(TYPERT_REMOTE)

  const disposeSlot = ctx.plugin({
    name: 'dsh-permission-split/panel',
    inject: ['slots', 'remote.jxPermission', 'remote.agentPresets', 'sessions', 'locale'],
    apply(child: ClientContext) {
      const face = child as unknown as {
        remote: { jxPermission: JxPermissionFace, agentPresets: CatalogFace }
        sessions: SessionsFace
        locale: { register(ns: string, dict: unknown): () => void, bind(ns: string): (key: string, values?: Record<string, string>) => string }
      }
      child.effect(
        () => face.locale.register('jxPermissionSplit', COPY),
        'dsh-permission-split: copy dictionaries',
      )
      const t = face.locale.bind('jxPermissionSplit')
      const controller = new PermissionSplitController(face.remote.jxPermission, face.remote.agentPresets)

      child.slots.inject('conversation.input.permission', () => child.slots.register({
        name: 'conversation.input.permission',
        locale: 'jxPermissionSplit',
        inject: (sessionId: string) => ({
          hooks: { permissionSplit: controller.source },
          load: async () => { await controller.load(sessionId) },
          // 预设写路径照搬官方：提交 `/permission <preset>` 命令行。
          selectPreset: async (preset: string) => {
            const live = face.sessions.binding(sessionId)?.session
            if (live === undefined) return
            const result = await live.command(`/permission ${preset}`)
            if (!result.ok) throw new Error(`${COPY.zh.failed}: ${result.error.message}`)
            controller.setCurrent(preset)
          },
          setGrant: async (capability: Capability, granted: boolean) => {
            await controller.setGrant(sessionId, capability, granted)
          },
        }),
      }, PermissionSplit as never))
    },
  })

  return async () => {
    await disposeSlot()
    await disposeMount()
    await disposeStyle()
  }
}
