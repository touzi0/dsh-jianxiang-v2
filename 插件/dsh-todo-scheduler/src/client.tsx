/**
 * 待办事项与定时任务 —— 浏览器半边。
 *
 * 侧边栏入口照官方「插件」行的同一机制注册（`sidebar.panellist` 行 + 同 key 的
 * `main` 全局面板，与 `ui-plugin-manager` 完全同构）：入口出现在官方「插件」行的
 * 位置（该行已被 dsh-plugin-entry 隐藏，视觉上就是「新工作任务 / 数字助理」下方），
 * 点击后面板在主列打开。页面风格对齐官方插件页：居中 960px 一列、20px 标题 +
 * 13px 说明、卡片列表、右上角主操作按钮（PluginManagerPage.module.css 的尺度）。
 *
 * 新建/编辑表单经 React portal 渲到 document.body：遮罩是真正的全页覆盖
 * （面板容器带 transform，fixed 定位放在页面树里只会盖住一列）。
 */
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Button, IconAlarmClockOutline16, IconPlusOutline16, StateDot, Switch,
  type StateDotState,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { TYPERT_REMOTE } from './remote-client.ts'
import { en, NS, zh, type JxTodoLocaleKey } from './locales.ts'
import type {
  CommandSpec, CreateTaskRequest, ResolveMissedRequest, RunRecord, RunNowResult, Schedule,
  TaskExecutor, TaskItem, TaskView, TodoSnapshot, UpdateTaskRequest, WorkspaceOption,
} from './types.ts'

/** 侧边栏行 id，与 main 面板的 key 一致。 */
export const PANEL_ID = 'todo-scheduler'

/** 顶层插件只负责挂 Remote 命名空间（打开会话等实现在子插件里）。 */
export const inject = ['remote']

type RemoteResult<T> = { ok: true, value: T } | { ok: false, error: { code: string, message: string } }

interface TodoRemote {
  listTasks: () => Promise<RemoteResult<TodoSnapshot>>
  createTask: (request: CreateTaskRequest) => Promise<RemoteResult<{ task: TaskView }>>
  updateTask: (request: UpdateTaskRequest) => Promise<RemoteResult<{ task: TaskView }>>
  deleteTask: (request: { id: string }) => Promise<RemoteResult<{ ok: true }>>
  runNow: (request: { id: string }) => Promise<RemoteResult<RunNowResult>>
  resolveMissed: (request: ResolveMissedRequest) => Promise<RemoteResult<{ ok: true }>>
  listWorkspaces: () => Promise<RemoteResult<{ items: WorkspaceOption[] }>>
}

/** 页面拿到的能力（子插件 inject 闭包提供；组件不碰 ctx）。 */
export interface TodoPageApi {
  t: (key: JxTodoLocaleKey) => string
  listTasks: () => Promise<TodoSnapshot>
  listWorkspaces: () => Promise<WorkspaceOption[]>
  createTask: (request: CreateTaskRequest) => Promise<void>
  updateTask: (request: UpdateTaskRequest) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  runNow: (id: string) => Promise<RunNowResult>
  resolveMissed: (request: ResolveMissedRequest) => Promise<void>
  openSession: (sessionId: string) => void
}

/** 解开 Remote 的 ok/error 包装；失败抛出带业务码的错误。 */
async function unwrap<T>(promise: Promise<RemoteResult<T>>): Promise<T> {
  const result = await promise
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

/** epoch 毫秒 → `YYYY-MM-DD HH:mm`（本地时区）。 */
export function formatTime(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (part: number): string => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 执行方式的一句话（卡片徽标与表单标签共用）。 */
export function scheduleText(schedule: Schedule, t: (key: JxTodoLocaleKey) => string): string {
  switch (schedule.kind) {
    case 'manual': return t('schedule.manual')
    case 'once': return `${t('schedule.once')} · ${formatTime(schedule.at)}`
    case 'daily': return `${t('schedule.daily')} · ${schedule.time}`
    case 'weekly': return `${t('schedule.weekly')}（${schedule.days.slice().sort().map(day => t(`weekday.${day}` as JxTodoLocaleKey)).join(' ')}） · ${schedule.time}`
    case 'weekdays': return `${t('schedule.weekdays')} · ${schedule.time}`
    case 'interval': return `${t('schedule.interval')}：${schedule.everyMinutes}`
  }
}

/** 状态圆点：任务与记录共用。 */
function statusDot(status: TaskItem['lastStatus']): StateDotState {
  if (status === 'ok') return 'done'
  if (status === 'failed') return 'error'
  if (status === 'running') return 'ongoing'
  return 'idle'
}

// ---------------------------------------------------------------- 页面样式表

/** 样式表：尺度对齐官方插件页（居中 960、20px 标题、13px 说明、卡片圆角 12）。 */
const STYLE = `
.jx-todo-page{display:flex;flex-direction:column;gap:20px;box-sizing:border-box;height:100%;overflow:auto;padding:28px clamp(24px,4vw,48px) 48px;color:var(--dsw-alias-label-primary,#1a1a1a)}
.jx-todo-page>*{width:100%;max-width:960px;margin:0 auto}
.jx-todo-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.jx-todo-title{margin:0;font-size:20px;font-weight:500;line-height:28px}
.jx-todo-intro{margin:4px 0 0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary,#6b6b6b)}
.jx-todo-notice{font-size:13px;line-height:20px;color:var(--dsw-alias-state-error-primary,#e5484d);white-space:pre-wrap}
.jx-todo-missed{border:1px solid var(--dsw-alias-state-warning-primary,#f0b429);border-radius:12px;padding:12px 16px;display:flex;flex-direction:column;gap:8px;font-size:13px;line-height:20px}
.jx-todo-missed-item{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.jx-todo-missed-title{font-weight:500}
.jx-todo-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.jx-todo-card{border:1px solid var(--dsw-alias-border-l1,#e3e3e3);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px;background:var(--dsw-alias-bg-base,#fff)}
.jx-todo-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.jx-todo-task-title{margin:0;font-size:15px;font-weight:500;line-height:22px}
.jx-todo-badges{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.jx-todo-badge{font-size:11px;line-height:16px;padding:1px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,#d9d9d9);color:var(--dsw-alias-label-secondary,#6b6b6b);white-space:nowrap}
.jx-todo-badge.off{color:var(--dsw-alias-label-tertiary,#9a9a9a);border-style:dashed}
.jx-todo-badge.kind{color:var(--dsw-alias-state-accent-primary,#4c6ef5);border-color:currentColor}
.jx-todo-desc{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary,#6b6b6b);white-space:pre-wrap;word-break:break-word}
.jx-todo-cmdline{margin:0;font-family:Consolas,Menlo,monospace;font-size:12.5px;line-height:18px;color:var(--dsw-alias-label-secondary,#6b6b6b);background:var(--dsw-alias-bg-secondary,#f6f6f6);border-radius:6px;padding:6px 10px;word-break:break-all}
.jx-todo-meta{display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;line-height:18px;color:var(--dsw-alias-label-tertiary,#9a9a9a)}
.jx-todo-meta b{font-weight:500;color:var(--dsw-alias-label-secondary,#6b6b6b)}
.jx-todo-lastline{display:flex;align-items:center;gap:6px;font-size:12.5px;line-height:18px;color:var(--dsw-alias-label-secondary,#6b6b6b)}
.jx-todo-records{border-top:1px solid var(--dsw-alias-border-l1,#e3e3e3);padding-top:10px;display:flex;flex-direction:column;gap:6px}
.jx-todo-record{display:flex;gap:8px;align-items:baseline;font-size:12.5px;line-height:18px;color:var(--dsw-alias-label-secondary,#6b6b6b);flex-wrap:wrap}
.jx-todo-record-when{color:var(--dsw-alias-label-tertiary,#9a9a9a);flex:none}
.jx-todo-record-summary{word-break:break-word;white-space:pre-wrap}
.jx-todo-link{background:none;border:none;padding:0;font-size:12.5px;line-height:18px;color:var(--dsw-alias-state-accent-primary,#4c6ef5);cursor:pointer;text-decoration:underline}
.jx-todo-empty{font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary,#9a9a9a);text-align:center;padding:32px 0}
.jx-todo-form-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#9a9a9a);margin:0}
/* 表单弹窗：portal 渲到 body，遮罩盖满整页。 */
.jx-todo-mask{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:2000}
.jx-todo-modal{background:var(--dsw-alias-bg-base,#fff);border-radius:16px;box-shadow:0 24px 72px rgba(0,0,0,.32);width:min(680px,calc(100vw - 48px));max-height:calc(100vh - 64px);overflow:auto;padding:24px;display:flex;flex-direction:column;gap:16px;color:var(--dsw-alias-label-primary,#1a1a1a)}
/* 两列等宽栅格：标签固定一行短文案，控件对齐；整行元素跨两列。 */
.jx-todo-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 16px}
.jx-todo-span2{grid-column:1 / -1}
.jx-todo-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.jx-todo-field-label{font-size:13px;line-height:20px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jx-todo-input,.jx-todo-select,.jx-todo-textarea{box-sizing:border-box;width:100%;font-size:13px;line-height:20px;padding:7px 10px;border:1px solid var(--dsw-alias-border-l2,#d9d9d9);border-radius:8px;background:var(--dsw-alias-bg-base,#fff);color:inherit;font-family:inherit}
.jx-todo-textarea{min-height:104px;resize:vertical}
.jx-todo-days{display:flex;gap:8px;flex-wrap:wrap;min-height:34px;align-items:center}
.jx-todo-day{display:flex;gap:4px;align-items:center;font-size:12.5px}
/* 任务类型：两枚等宽分段按钮。 */
.jx-todo-execseg{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.jx-todo-typehint{margin:0}
.jx-todo-modal-foot{display:flex;justify-content:flex-end;gap:8px}
`

// ------------------------------------------------------------------- 表单

/** 表单里的执行方式种类（与 Schedule.kind 一致）。 */
type FormKind = 'manual' | 'once' | 'daily' | 'weekly' | 'weekdays' | 'interval'

interface FormState {
  /** 编辑中的任务 id；undefined 表示新建。 */
  editingId?: string
  title: string
  description: string
  executor: TaskExecutor
  kind: FormKind
  onceAt: string
  time: string
  days: boolean[]
  everyMinutes: string
  workspaceId: string
  command: string
  args: string
  enabled: boolean
}

const EMPTY_FORM: FormState = {
  title: '', description: '', executor: 'assistant', kind: 'manual', onceAt: '', time: '09:00',
  days: [false, true, true, true, true, true, false], everyMinutes: '30',
  workspaceId: '', command: '', args: '', enabled: true,
}

/** epoch 毫秒 → datetime-local 输入值（本地时区）。 */
function toLocalInput(epoch: number): string {
  const date = new Date(epoch)
  const pad = (part: number): string => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 任务 → 表单初值（编辑用）。 */
export function toForm(task: TaskView): FormState {
  const schedule = task.schedule
  return {
    editingId: task.id,
    title: task.title,
    description: task.description,
    executor: task.executor === 'command' ? 'command' : 'assistant',
    kind: schedule.kind,
    onceAt: schedule.kind === 'once' ? toLocalInput(schedule.at) : '',
    time: 'time' in schedule ? schedule.time : '09:00',
    days: schedule.kind === 'weekly'
      ? [0, 1, 2, 3, 4, 5, 6].map(day => schedule.days.includes(day))
      : [...EMPTY_FORM.days],
    everyMinutes: schedule.kind === 'interval' ? String(schedule.everyMinutes) : '30',
    workspaceId: task.target.workspaceId,
    command: task.command?.command ?? '',
    args: task.command?.args ?? '',
    enabled: task.enabled,
  }
}

/** 表单校验；'' 表示通过。 */
export function formError(form: FormState, t: (key: JxTodoLocaleKey) => string): string {
  if (form.title.trim() === '') return t('error.titleRequired')
  if (form.description.trim() === '') return t('error.descriptionRequired')
  if (form.executor === 'command') {
    if (form.command.trim() === '') return t('error.commandRequired')
    if (form.workspaceId === '') return t('error.workdirRequired')
  }
  if (form.kind === 'once' && form.onceAt === '') return t('error.onceTimeRequired')
  if (form.kind === 'weekly' && !form.days.some(day => day)) return t('error.weekdaysRequired')
  if (form.kind === 'interval' && !(Number.isInteger(Number(form.everyMinutes)) && Number(form.everyMinutes) >= 1)) return t('error.intervalRequired')
  return ''
}

/** 表单 → 新建/更新请求体（patch 与 create 同形状）。 */
export function toRequest(form: FormState): CreateTaskRequest {
  const schedule: Schedule = (() => {
    switch (form.kind) {
      case 'manual': return { kind: 'manual' }
      case 'once': return { kind: 'once', at: new Date(form.onceAt).getTime() }
      case 'daily': return { kind: 'daily', time: form.time }
      case 'weekly': return { kind: 'weekly', days: form.days.flatMap((on, day) => on ? [day] : []), time: form.time }
      case 'weekdays': return { kind: 'weekdays', time: form.time }
      case 'interval': return { kind: 'interval', everyMinutes: Number(form.everyMinutes) }
    }
  })()
  const command: CommandSpec | undefined = form.executor === 'command'
    ? { command: form.command.trim(), args: form.args.trim() }
    : undefined
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    executor: form.executor,
    schedule,
    target: { workspaceId: form.executor === 'command' ? form.workspaceId : '' },
    ...(command === undefined ? {} : { command }),
    enabled: form.enabled,
  }
}

// ------------------------------------------------------------------- 组件

/** 一张任务卡片。 */
function TaskCard(props: {
  task: TaskView
  records: readonly RunRecord[]
  missedSlot: number | undefined
  workspaceTitle: string | undefined
  api: TodoPageApi
  busy: boolean
  deleteArmed: boolean
  onEdit: () => void
  onDelete: () => void
  onToggle: (enabled: boolean) => void
  onRun: () => void
  onResolveMissed: (action: 'run' | 'dismiss') => void
}): ReactNode {
  const { task, api } = props
  const t = api.t
  const [expanded, setExpanded] = useState(false)
  const recent = props.records.slice(0, 5)
  const isCommand = task.executor === 'command'
  return (
    <div className="jx-todo-card">
      <div className="jx-todo-card-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div className="jx-todo-badges">
            <span className="jx-todo-badge kind">{isCommand ? t('type.command') : t('type.assistant')}</span>
            <span className={`jx-todo-badge${task.enabled ? '' : ' off'}`}>{scheduleText(task.schedule, t)}</span>
            {!task.enabled && <span className="jx-todo-badge off">{t('label.disabled')}</span>}
          </div>
          <h3 className="jx-todo-task-title">{task.title}</h3>
        </div>
        <Switch checked={task.enabled} label={`${t('label.enabled')}：${task.title}`} disabled={props.busy} onChange={props.onToggle} />
      </div>
      {isCommand && task.command !== undefined && (
        <p className="jx-todo-cmdline">$ {task.command.command}{task.command.args === '' ? '' : ` ${task.command.args}`}</p>
      )}
      {task.description !== '' && <p className="jx-todo-desc">{task.description}</p>}
      <div className="jx-todo-meta">
        <span><b>{isCommand ? t('label.workdir') : t('label.target')}</b>：{isCommand ? (props.workspaceTitle ?? t('label.noWorkspace')) : t('type.assistant')}</span>
        {task.enabled && task.schedule.kind !== 'manual' && (
          <span><b>{t('label.nextRun')}</b>：{task.nextRunAt === undefined ? '—' : formatTime(task.nextRunAt)}</span>
        )}
        {task.enabled && task.schedule.kind === 'manual' && <span>{t('label.notScheduled')}</span>}
        <span><b>{t('label.lastRun')}</b>：{formatTime(task.lastRunAt)}</span>
      </div>
      {(task.lastStatus !== undefined || task.lastError !== undefined) && (
        <div className="jx-todo-lastline">
          {task.lastStatus !== undefined && <StateDot state={statusDot(task.lastStatus)} />}
          <span>
            {task.lastStatus !== undefined ? t(`status.${task.lastStatus}` as JxTodoLocaleKey) : ''}
            {task.lastError !== undefined ? `：${task.lastError}` : ''}
          </span>
        </div>
      )}
      {props.missedSlot !== undefined && (
        <div className="jx-todo-missed-item">
          <span>{formatTime(props.missedSlot)}</span>
          <span className="jx-todo-actions">
            <Button size="sm" variant="outline" disabled={props.busy} onClick={() => { props.onResolveMissed('run') }}>{t('action.catchUp')}</Button>
            <Button size="sm" variant="ghost" disabled={props.busy} onClick={() => { props.onResolveMissed('dismiss') }}>{t('action.dismiss')}</Button>
          </span>
        </div>
      )}
      <div className="jx-todo-actions">
        <Button size="sm" variant="primary" disabled={props.busy} onClick={props.onRun}>{t('action.runNow')}</Button>
        <Button size="sm" variant="outline" disabled={props.busy} onClick={props.onEdit}>{t('action.edit')}</Button>
        <Button size="sm" variant="ghost" disabled={props.busy} onClick={props.onDelete}>
          {props.deleteArmed ? t('confirm.delete') : t('action.delete')}
        </Button>
        {props.records.length > 0 && (
          <button type="button" className="jx-todo-link" onClick={() => { setExpanded(value => !value) }}>
            {t('list.records')}（{props.records.length}）{expanded ? '▴' : '▾'}
          </button>
        )}
      </div>
      {expanded && (
        <div className="jx-todo-records">
          {recent.length === 0 && <span className="jx-todo-record">{t('list.noRecords')}</span>}
          {recent.map(record => (
            <div key={record.id} className="jx-todo-record">
              <span className="jx-todo-record-when">{formatTime(record.startedAt)}</span>
              <StateDot state={statusDot(record.status)} />
              <span>{t(`trigger.${record.trigger}` as JxTodoLocaleKey)}</span>
              {record.summary !== undefined && record.summary !== '' && <span className="jx-todo-record-summary">{record.summary}</span>}
              {record.error !== undefined && <span className="jx-todo-form-error">{record.error}</span>}
              {record.sessionId !== undefined && (
                <button type="button" className="jx-todo-link" onClick={() => { api.openSession(record.sessionId!) }}>
                  {t('action.openSession')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 表单里一个「标签 + 控件」的格子；label 固定一行，控件不受标签长度影响。 */
function Field(props: { label: string, children: ReactNode, span2?: boolean }): ReactNode {
  return (
    <div className={props.span2 === true ? 'jx-todo-field jx-todo-span2' : 'jx-todo-field'}>
      <span className="jx-todo-field-label">{props.label}</span>
      {props.children}
    </div>
  )
}

/** 新建/编辑表单。portal 渲到 body：遮罩盖满整页，不随面板容器裁剪。 */
function TaskForm(props: {
  form: FormState
  setForm: (next: FormState) => void
  workspaces: readonly WorkspaceOption[]
  error: string
  busy: boolean
  t: (key: JxTodoLocaleKey) => string
  onSave: () => void
  onCancel: () => void
}): ReactNode {
  const { form, t } = props
  const patch = (partial: Partial<FormState>): void => { props.setForm({ ...form, ...partial }) }
  const isCommand = form.executor === 'command'
  return createPortal(
    <div className="jx-todo-mask" onMouseDown={event => { if (event.target === event.currentTarget) props.onCancel() }}>
      <div className="jx-todo-modal" role="dialog" aria-modal="true" aria-label={form.editingId === undefined ? t('action.new') : t('action.edit')}>
        <Field label={t('label.executor')} span2>
          <div className="jx-todo-execseg">
            <Button variant={isCommand ? 'outline' : 'primary'} onClick={() => { patch({ executor: 'assistant' }) }}>{t('type.assistant')}</Button>
            <Button variant={isCommand ? 'primary' : 'outline'} onClick={() => { patch({ executor: 'command' }) }}>{t('type.command')}</Button>
          </div>
          <p className="jx-todo-form-hint jx-todo-typehint">{isCommand ? t('type.hint.command') : t('type.hint.assistant')}</p>
        </Field>
        <Field label={t('label.title')} span2>
          <input id="jx-todo-title" className="jx-todo-input" value={form.title} placeholder={t('label.title.placeholder')} onChange={event => { patch({ title: event.target.value }) }} />
        </Field>
        <Field label={t('label.description')} span2>
          <textarea id="jx-todo-desc" className="jx-todo-textarea" value={form.description} onChange={event => { patch({ description: event.target.value }) }} />
          <span className="jx-todo-form-hint">{t('label.description.hint')}</span>
        </Field>
        <Field label={t('label.schedule')}>
          <select id="jx-todo-kind" className="jx-todo-select" value={form.kind} onChange={event => { patch({ kind: event.target.value as FormKind }) }}>
            {FORM_KINDS.map(kind => <option key={kind} value={kind}>{t(`schedule.${kind}` as JxTodoLocaleKey)}</option>)}
          </select>
        </Field>
        {form.kind === 'once' && (
          <Field label={t('schedule.at')}>
            <input id="jx-todo-once" type="datetime-local" className="jx-todo-input" value={form.onceAt} onChange={event => { patch({ onceAt: event.target.value }) }} />
          </Field>
        )}
        {(form.kind === 'daily' || form.kind === 'weekly' || form.kind === 'weekdays') && (
          <Field label={t('schedule.time')}>
            <input id="jx-todo-time" type="time" className="jx-todo-input" value={form.time} onChange={event => { patch({ time: event.target.value }) }} />
          </Field>
        )}
        {form.kind === 'weekly' && (
          <Field label={t('schedule.days')} span2>
            <div className="jx-todo-days">
              {[0, 1, 2, 3, 4, 5, 6].map(day => (
                <label key={day} className="jx-todo-day">
                  <input type="checkbox" checked={form.days[day]} onChange={event => {
                    patch({ days: form.days.map((on, index) => index === day ? event.target.checked : on) })
                  }} />
                  {t(`weekday.${day}` as JxTodoLocaleKey)}
                </label>
              ))}
            </div>
          </Field>
        )}
        {form.kind === 'interval' && (
          <Field label={t('schedule.every')}>
            <input id="jx-todo-every" type="number" min={1} className="jx-todo-input" value={form.everyMinutes} onChange={event => { patch({ everyMinutes: event.target.value }) }} />
          </Field>
        )}
        {isCommand && (
          <>
            <Field label={t('label.command')}>
              <input id="jx-todo-command" className="jx-todo-input" value={form.command} placeholder={t('label.command.placeholder')} onChange={event => { patch({ command: event.target.value }) }} />
            </Field>
            <Field label={t('label.args')}>
              <input id="jx-todo-args" className="jx-todo-input" value={form.args} placeholder={t('label.args.placeholder')} onChange={event => { patch({ args: event.target.value }) }} />
            </Field>
            <Field label={t('label.workdir')} span2>
              <select id="jx-todo-workspace" className="jx-todo-select" value={form.workspaceId} onChange={event => { patch({ workspaceId: event.target.value }) }}>
                <option value="">—</option>
                {props.workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.title}</option>)}
              </select>
            </Field>
          </>
        )}
        <Field label={t('label.enabled')}>
          <Switch checked={form.enabled} label={t('label.enabled')} onChange={enabled => { patch({ enabled }) }} />
        </Field>
        {props.error !== '' && <span className="jx-todo-form-error jx-todo-span2">{props.error}</span>}
        <div className="jx-todo-modal-foot jx-todo-span2">
          <Button variant="ghost" onClick={props.onCancel}>{t('action.cancel')}</Button>
          <Button variant="primary" disabled={props.busy} onClick={props.onSave}>{t('action.save')}</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** 表单里的执行方式种类（顺序渲染）。 */
const FORM_KINDS: readonly FormKind[] = ['manual', 'once', 'daily', 'weekly', 'weekdays', 'interval']

/** 主页面：错过横幅 + 任务列表 + 表单。组件不碰 ctx，一切经 api。 */
export function TodoPage(props: { api: TodoPageApi }): ReactNode {
  const { api } = props
  const [snapshot, setSnapshot] = useState<TodoSnapshot | undefined>(undefined)
  const [workspaces, setWorkspaces] = useState<readonly WorkspaceOption[]>([])
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<FormState | undefined>(undefined)
  const [formProblem, setFormProblem] = useState('')
  const [deleteArmed, setDeleteArmed] = useState<string | undefined>(undefined)

  useEffect(() => {
    let disposed = false
    const reload = async (): Promise<void> => {
      try {
        const [snap, spaces] = await Promise.all([api.listTasks(), api.listWorkspaces()])
        if (disposed) return
        setSnapshot(snap)
        setWorkspaces(spaces)
      } catch (error: unknown) {
        if (!disposed) setNotice(`${api.t('error.load')}：${String(error)}`)
      }
    }
    void reload()
    const timer = setInterval(() => { void reload() }, 30_000)
    return () => { disposed = true; clearInterval(timer) }
  }, [])

  const recordsOf = (taskId: string): RunRecord[] =>
    (snapshot?.records ?? []).filter(record => record.taskId === taskId)

  /** 包一层忙碌态 + 事后刷新；RunNowResult 的业务失败变成页面提示。 */
  const act = async (action: () => Promise<RunNowResult | void>): Promise<void> => {
    setBusy(true)
    setNotice('')
    try {
      const result = await action()
      if (result !== undefined && typeof result === 'object' && 'ok' in result && result.ok === false && result.error !== undefined) {
        setNotice(result.error)
      }
    } catch (error: unknown) {
      setNotice(String(error))
    } finally {
      setBusy(false)
      try {
        const snap = await api.listTasks()
        setSnapshot(snap)
      } catch { /* 下一轮 30 秒轮询会再试 */ }
    }
  }

  const saveForm = async (): Promise<void> => {
    if (form === undefined) return
    const problem = formError(form, api.t)
    if (problem !== '') { setFormProblem(problem); return }
    setBusy(true)
    try {
      if (form.editingId !== undefined) {
        // patch 必须是请求形状（schedule/target），不是表单原始字段，否则宿主侧
        // 改执行方式的 patch 会被静默丢弃。
        await api.updateTask({ id: form.editingId, patch: toRequest(form) })
      } else {
        await api.createTask(toRequest(form))
      }
      setForm(undefined)
      setFormProblem('')
    } catch (error: unknown) {
      setFormProblem(String(error))
    } finally {
      setBusy(false)
      try {
        const snap = await api.listTasks()
        setSnapshot(snap)
      } catch { /* 下一轮轮询再试 */ }
    }
  }

  const t = api.t
  const workspaceTitles = new Map(workspaces.map(workspace => [workspace.id, workspace.title]))
  return (
    <div className="jx-todo-page">
      <div className="jx-todo-head">
        <div>
          <h2 className="jx-todo-title">{t('page.title')}</h2>
          <p className="jx-todo-intro">{t('page.intro')}</p>
        </div>
        <Button variant="primary" icon={<IconPlusOutline16 size={14} />} onClick={() => { setForm({ ...EMPTY_FORM }); setFormProblem('') }}>
          {t('action.new')}
        </Button>
      </div>
      {notice !== '' && <p className="jx-todo-notice">{notice}</p>}
      {snapshot !== undefined && snapshot.missed.length > 0 && (
        <div className="jx-todo-missed">
          <span>{t('missed.banner', { count: String(snapshot.missed.length) })}</span>
        </div>
      )}
      {(snapshot?.tasks.length ?? 0) === 0 && <p className="jx-todo-empty">{t('list.empty')}</p>}
      {(snapshot?.tasks ?? []).map(task => (
        <TaskCard
          key={task.id}
          task={task}
          records={recordsOf(task.id)}
          missedSlot={snapshot?.missed.find(item => item.taskId === task.id)?.slotTime}
          workspaceTitle={workspaceTitles.get(task.target.workspaceId)}
          api={api}
          busy={busy}
          deleteArmed={deleteArmed === task.id}
          onEdit={() => { setForm(toForm(task)); setFormProblem('') }}
          onDelete={() => {
            if (deleteArmed !== task.id) { setDeleteArmed(task.id); return }
            setDeleteArmed(undefined)
            void act(async () => { await api.deleteTask(task.id) })
          }}
          onToggle={enabled => { void act(async () => { await api.updateTask({ id: task.id, patch: { enabled } }) }) }}
          onRun={() => { void act(() => api.runNow(task.id)) }}
          onResolveMissed={action => { void act(async () => { await api.resolveMissed({ id: task.id, action }) }) }}
        />
      ))}
      <p className="jx-todo-form-hint">{t('footer.dataFile')}：{snapshot?.dataFile ?? '…'}</p>
      {form !== undefined && (
        <TaskForm
          form={form}
          setForm={setForm}
          workspaces={workspaces}
          error={formProblem}
          busy={busy}
          t={t}
          onSave={() => { void saveForm() }}
          onCancel={() => { setForm(undefined); setFormProblem('') }}
        />
      )}
    </div>
  )
}

/** 侧边栏行图标（官方行壳负责按钮、文字与选中态）。 */
export function TodoPanelIcon({ size }: { size: number }): ReactNode {
  return <IconAlarmClockOutline16 size={size} />
}

/** 挂 Remote、注册词典/样式/入口/面板；返回卸载。 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeMount = await ctx.remote.$mount(TYPERT_REMOTE)

  const disposeUi = ctx.plugin({
    name: 'dsh-todo-scheduler/ui',
    inject: ['slots', 'locale', 'remote.jxTodo', 'uiWorkspace'],
    apply(child: ClientContext) {
      child.effect(() => child.locale.register(NS, { zh, en }), 'dsh-todo-scheduler: dictionaries')
      const scoped = child as unknown as {
        locale: { bind: (ns: string) => (key: JxTodoLocaleKey, params?: Record<string, string>) => string }
        remote: { jxTodo: TodoRemote }
        get: (name: string) => unknown
        slots: {
          inject: (name: string, factory: () => unknown) => void
          register: (options: Record<string, unknown>, component: unknown) => unknown
        }
      }
      const t = scoped.locale.bind(NS)

      // 样式表：fiber 拆除时撤掉。
      child.effect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-jx-todo-scheduler', '1')
        style.textContent = STYLE
        document.head.append(style)
        return () => { style.remove() }
      }, 'dsh-todo-scheduler: style')

      const uiWorkspace = () => scoped.get('uiWorkspace') as { openSession: (sessionId: string) => void } | undefined

      const api: TodoPageApi = {
        t,
        listTasks: () => unwrap(scoped.remote.jxTodo.listTasks()),
        listWorkspaces: async () => (await unwrap(scoped.remote.jxTodo.listWorkspaces())).items,
        createTask: async request => { await unwrap(scoped.remote.jxTodo.createTask(request)) },
        updateTask: async request => { await unwrap(scoped.remote.jxTodo.updateTask(request)) },
        deleteTask: async id => { await unwrap(scoped.remote.jxTodo.deleteTask({ id })) },
        runNow: async id => unwrap(scoped.remote.jxTodo.runNow({ id })),
        resolveMissed: async request => { await unwrap(scoped.remote.jxTodo.resolveMissed(request)) },
        openSession: sessionId => { uiWorkspace()?.openSession(sessionId) },
      }

      // 主列面板：与官方插件页同一机制（main 槽 + panellist 行同 key）。
      scoped.slots.inject('main', () => scoped.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: () => ({ api }),
      }, TodoPage))
      // 侧边栏行：官方「插件」行是 order 0（已被 dsh-plugin-entry 隐藏），本行出现在原位置。
      scoped.slots.inject('sidebar.panellist', () => scoped.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 5,
        label: () => t('panel'),
        locale: NS,
      }, TodoPanelIcon))
    },
  })

  return async () => {
    await disposeUi()
    await disposeMount()
  }
}
