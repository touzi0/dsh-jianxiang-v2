/**
 * 计划扫描与落盘（宿主侧纯逻辑）。
 * 事件契约（已核实）：tool/call = {turn,step,callId,name,arguments(JSON字符串)}，
 * tool/result = {turn,step,message:{callId,content,isError}}——按 callId 配对。
 * 状态：isError=false → approved；isError=true → rejected；无 result → pending。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export interface JxPlanRecord {
  seq: number
  time: number
  plan: string
  status: 'approved' | 'rejected' | 'pending'
  /** 落盘文件绝对路径。 */
  file: string
}

interface LooseEvent {
  readonly type: string
  readonly seq?: number
  readonly time?: number
  readonly data?: unknown
}

/** 解析 DSH home（与官方 resolveDshHome 同规则）。 */
function resolveDshHome(): string {
  const fromEnv = process.env.DSH_HOME
  const selected = fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : join(homedir(), '.dsh')
  return resolve(selected)
}

/** 计划落盘目录。 */
export function plansDir(): string {
  return join(resolveDshHome(), 'plans')
}

/** 文件名安全字符。 */
function slugify(title: string): string {
  const first = title.split('\n')[0]?.replace(/^#\s*/, '').trim() ?? ''
  const kept = first.replace(/[\\/:*?"<>|\r\n\t]/g, ' ').replace(/\s+/g, '-').slice(0, 40)
  return kept === '' ? 'plan' : kept
}

function frontmatter(sessionId: string, record: { seq: number, time: number, status: string }): string {
  return [
    '---',
    `session: ${sessionId}`,
    `seq: ${record.seq}`,
    `status: ${record.status}`,
    `presentedAt: ${new Date(record.time).toISOString()}`,
    '---',
    '',
  ].join('\n')
}

/** 目录内已有文件的索引：`session/seq` → 文件路径（按 frontmatter 识别）。 */
function existingIndex(dir: string): Map<string, { path: string, status: string }> {
  const index = new Map<string, { path: string, status: string }>()
  if (!existsSync(dir)) return index
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md')) continue
    const path = join(dir, name)
    let head = ''
    try {
      head = readFileSync(path, 'utf8').split('---').slice(0, 3)[1] ?? ''
    } catch {
      continue
    }
    const session = /^session:\s*(.*)$/m.exec(head)?.[1]?.trim() ?? ''
    const seq = /^seq:\s*(\d+)/m.exec(head)?.[1]
    const status = /^status:\s*(\S+)/m.exec(head)?.[1] ?? ''
    if (seq !== undefined && session !== '') index.set(`${session}/${seq}`, { path, status })
  }
  return index
}

/**
 * 扫描一个会话的计划并同步落盘（幂等：已有文件只更新状态，缺失则创建）。
 * @returns 计划清单，最新在前。
 */
export function collectPlans(sessionId: string, events: readonly LooseEvent[]): JxPlanRecord[] {
  const dir = plansDir()
  const index = existingIndex(dir)

  const calls: Array<{ seq: number, time: number, callId: string, plan: string }> = []
  const results = new Map<string, boolean>()
  for (const event of events) {
    const data = event.data as Record<string, unknown> | undefined
    if (event.type === 'tool/call' && data !== undefined) {
      if (data.name !== 'exit_plan_mode' || typeof data.arguments !== 'string') continue
      let plan: unknown
      try {
        plan = (JSON.parse(data.arguments) as { plan?: unknown }).plan
      } catch {
        continue
      }
      if (typeof plan !== 'string' || plan.trim() === '') continue
      calls.push({
        seq: typeof event.seq === 'number' ? event.seq : 0,
        time: typeof event.time === 'number' ? event.time : 0,
        callId: String(data.callId ?? ''),
        plan,
      })
    } else if (event.type === 'tool/result' && data !== undefined) {
      const message = data.message as { callId?: unknown, isError?: unknown } | undefined
      if (message === undefined || message.callId === undefined) continue
      if (!calls.some(call => call.callId === String(message.callId))) continue
      results.set(String(message.callId), message.isError === true)
    }
  }

  mkdirSync(dir, { recursive: true })
  const records: JxPlanRecord[] = []
  for (const call of [...calls].reverse()) {
    const isError = results.get(call.callId)
    const status: JxPlanRecord['status'] = isError === undefined ? 'pending' : isError ? 'rejected' : 'approved'
    const key = `${sessionId}/${call.seq}`
    const existing = index.get(key)
    let file: string
    if (existing !== undefined) {
      file = existing.path
      if (existing.status !== status) {
        rewriteStatus(file, status)
      }
    } else {
      const stamp = new Date(call.time)
      const name = `${Number.isNaN(stamp.getTime()) ? 'unknown' : stamp.toISOString().slice(0, 16).replace('T', '-').replace(/:/g, '')}-${slugify(call.plan)}.md`
      file = join(dir, name)
      writeFileSync(file, `${frontmatter(sessionId, { seq: call.seq, time: call.time, status })}${call.plan}\n`, 'utf8')
    }
    records.push({ seq: call.seq, time: call.time, plan: call.plan, status, file })
  }
  return records
}

/** 只重写文件头的 status 行（正文原样保留）。 */
function rewriteStatus(path: string, status: string): void {
  try {
    const content = readFileSync(path, 'utf8')
    const updated = content.replace(/^(---[\s\S]*?^status:\s*)\S+/m, `$1${status}`)
    if (updated !== content) writeFileSync(path, updated, 'utf8')
  } catch {
    /* 竞态删除等情况忽略：下次扫描按缺失重建 */
  }
}
