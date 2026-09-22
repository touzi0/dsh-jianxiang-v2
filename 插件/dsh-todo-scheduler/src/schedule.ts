/**
 * 待办事项与定时任务 —— 调度纯函数。
 *
 * 全部本地时区、分钟粒度。三个入口：
 * - `computeNextRunAt`：展示用「下次执行时间」。
 * - `computeDueSlot`：调度循环每一拍用——只认「刚到的槽点」，同一条任务一次循环
 *   至多触发一次；间隔类落后超过一个节拍就不自动追（那属于「错过」，交给用户决定）。
 * - `detectMissed`：服务没开着时错过的最近一个槽点（每天/每周类只回最近一个，
 *   不做连环补跑；由页面提示用户补跑或忽略）。
 */
import type { Schedule } from './types.ts'

/** 间隔类的追赶宽限：槽点过期超过「一个周期 + 这么多」就不再自动跑，转错过提示。 */
export const INTERVAL_GRACE_MS = 60_000

/**
 * 到期槽点的新鲜窗口：tick 每 20 秒一拍，槽点到点后这个窗口内 tick 都算「刚到」、
 * 照常触发；窗口之外（服务中途才启动/恢复）不自动追，交给 `detectMissed` 由用户
 * 决定补跑或忽略。窗口必须远大于 tick 间隔，保证服务开着时不会漏拍。
 */
export const DUE_FRESH_MS = 10 * 60_000

/** 解析 `HH:mm` 为当天分钟数；格式不对返回 undefined。 */
export function parseTimeToMinutes(time: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2})$/u.exec(time)
  if (match === null) return undefined
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return undefined
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return undefined
  return hours * 60 + minutes
}

/** 本地时区「某天 @ 当天分钟数」的 epoch 毫秒。 */
function slotOnDay(day: Date, minutes: number): number {
  const date = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0)
  return date.getTime()
}

/** 「<= now 的最近一个每天槽点」（今天或昨天）。 */
export function lastDailySlot(now: number, minutes: number): number {
  const day = new Date(now)
  const today = slotOnDay(day, minutes)
  if (today <= now) return today
  const yesterday = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1)
  return slotOnDay(yesterday, minutes)
}

/** 「> from 的下一个每天槽点」。 */
function nextDailySlot(from: number, minutes: number): number {
  const day = new Date(from)
  const today = slotOnDay(day, minutes)
  if (today > from) return today
  const tomorrow = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
  return slotOnDay(tomorrow, minutes)
}

/** 当天是否匹配 weekly 的 `days`（0=周日…6=周六）。 */
function matchesDays(day: Date, days: readonly number[]): boolean {
  return days.includes(day.getDay())
}

/** 「<= now 的最近一个匹配 `days` 的槽点」（最多往回找 7 天）。 */
export function lastWeeklySlot(now: number, days: readonly number[], minutes: number): number | undefined {
  const day = new Date(now)
  for (let back = 0; back < 8; back += 1) {
    const cursor = new Date(day.getFullYear(), day.getMonth(), day.getDate() - back)
    if (matchesDays(cursor, days)) {
      const slot = slotOnDay(cursor, minutes)
      if (slot <= now) return slot
    }
  }
  return undefined
}

/** 「> from 的下一个匹配 `days` 的槽点」（最多往后找 7 天）。 */
function nextWeeklySlot(from: number, days: readonly number[], minutes: number): number | undefined {
  const day = new Date(from)
  for (let ahead = 0; ahead < 8; ahead += 1) {
    const cursor = new Date(day.getFullYear(), day.getMonth(), day.getDate() + ahead)
    if (matchesDays(cursor, days)) {
      const slot = slotOnDay(cursor, minutes)
      if (slot > from) return slot
    }
  }
  return undefined
}

/** 周一…周五。 */
function isWeekday(day: Date): boolean {
  const weekday = day.getDay()
  return weekday >= 1 && weekday <= 5
}

/** 「<= now 的最近一个工作日槽点」。 */
export function lastWeekdaySlot(now: number, minutes: number): number {
  const day = new Date(now)
  for (let back = 0; back < 8; back += 1) {
    const cursor = new Date(day.getFullYear(), day.getMonth(), day.getDate() - back)
    if (isWeekday(cursor)) {
      const slot = slotOnDay(cursor, minutes)
      if (slot <= now) return slot
    }
  }
  // 8 天内必有工作日，这里不可达；返回 now 兜底保持全函数无 undefined。
  return now
}

/** 「> from 的下一个工作日槽点」。 */
function nextWeekdaySlot(from: number, minutes: number): number {
  const day = new Date(from)
  for (let ahead = 1; ahead < 9; ahead += 1) {
    const cursor = new Date(day.getFullYear(), day.getMonth(), day.getDate() + ahead)
    if (isWeekday(cursor)) return slotOnDay(cursor, minutes)
  }
  return from
}

/** 时间非法（`HH:mm` 解析失败）时，几种按时刻的方式都没有槽点。 */
function minuteOf(schedule: Schedule): number | undefined {
  const time = 'time' in schedule ? schedule.time : ''
  const parsed = parseTimeToMinutes(time)
  return parsed === undefined ? undefined : parsed
}

/**
 * 展示用「下次执行时间」；不自动执行（manual）或永不匹配（weekly 空天集、时间非法、
 * once 已过期）时是 undefined。
 */
export function computeNextRunAt(schedule: Schedule, from: number, lastRunAt: number | undefined): number | undefined {
  switch (schedule.kind) {
    case 'manual':
      return undefined
    case 'once':
      return schedule.at > from ? schedule.at : undefined
    case 'daily': {
      const minutes = minuteOf(schedule)
      return minutes === undefined ? undefined : nextDailySlot(from, minutes)
    }
    case 'weekly': {
      const minutes = minuteOf(schedule)
      if (minutes === undefined || schedule.days.length === 0) return undefined
      return nextWeeklySlot(from, schedule.days, minutes)
    }
    case 'weekdays': {
      const minutes = minuteOf(schedule)
      return minutes === undefined ? undefined : nextWeekdaySlot(from, minutes)
    }
    case 'interval': {
      const every = schedule.everyMinutes * 60_000
      if (!Number.isFinite(every) || every <= 0) return undefined
      const anchor = lastRunAt ?? from
      const next = anchor + every
      return next > from ? next : from + every
    }
  }
}

/**
 * 调度循环用：现在这一拍要不要触发，返回「本次槽点」（写进 lastRunAt 的那个值）。
 * 只认刚到的槽点：`slot <= now` 且 `slot > lastRunAt`；间隔类落后超过一个节拍
 * （加宽限）就不自动追——那种情况属于错过，走 `detectMissed` 由用户决定。
 */
export function computeDueSlot(
  schedule: Schedule,
  now: number,
  lastRunAt: number | undefined,
  anchor: number,
): number | undefined {
  if (schedule.kind === 'manual') return undefined
  const ran = lastRunAt ?? Number.NEGATIVE_INFINITY
  switch (schedule.kind) {
    case 'once':
      return schedule.at <= now && schedule.at > ran && now - schedule.at <= DUE_FRESH_MS ? schedule.at : undefined
    case 'daily':
    case 'weekdays':
    case 'weekly': {
      const minutes = minuteOf(schedule)
      if (minutes === undefined) return undefined
      if (schedule.kind === 'weekly' && !matchesDays(new Date(now), schedule.days)) return undefined
      if (schedule.kind === 'weekdays' && !isWeekday(new Date(now))) return undefined
      const slot = slotOnDay(new Date(now), minutes)
      return slot <= now && slot > ran && now - slot <= DUE_FRESH_MS ? slot : undefined
    }
    case 'interval': {
      const every = schedule.everyMinutes * 60_000
      if (!Number.isFinite(every) || every <= 0) return undefined
      const base = lastRunAt ?? anchor
      const next = base + every
      if (next > now) return undefined
      // 停了很久才回来：落后超过一个节拍就不追，转错过提示。
      if (now - next > every + INTERVAL_GRACE_MS) return undefined
      return next
    }
  }
}

/**
 * 错过检测：服务没开着时错过的**最近一个**槽点（`slot < now && slot > lastRunAt`）；
 * 没有错过返回 undefined。循环类只回最近一个，不连环。
 */
export function detectMissed(
  schedule: Schedule,
  now: number,
  lastRunAt: number | undefined,
  anchor: number,
): number | undefined {
  if (schedule.kind === 'manual') return undefined
  const ran = lastRunAt ?? Number.NEGATIVE_INFINITY
  switch (schedule.kind) {
    case 'once':
      return schedule.at < now && schedule.at > ran ? schedule.at : undefined
    case 'daily': {
      const minutes = minuteOf(schedule)
      if (minutes === undefined) return undefined
      const slot = lastDailySlot(now, minutes)
      return slot < now && slot > ran ? slot : undefined
    }
    case 'weekly': {
      const minutes = minuteOf(schedule)
      if (minutes === undefined || schedule.days.length === 0) return undefined
      const slot = lastWeeklySlot(now, schedule.days, minutes)
      return slot !== undefined && slot < now && slot > ran ? slot : undefined
    }
    case 'weekdays': {
      const minutes = minuteOf(schedule)
      if (minutes === undefined) return undefined
      const slot = lastWeekdaySlot(now, minutes)
      return slot < now && slot > ran ? slot : undefined
    }
    case 'interval': {
      const every = schedule.everyMinutes * 60_000
      if (!Number.isFinite(every) || every <= 0) return undefined
      const base = lastRunAt ?? anchor
      const next = base + every
      // 与 computeDueSlot 的「不追」条件对齐：深落后（tick 不会追）才算错过；
      // 浅落后 tick 会自己追上，不算错过。
      return next < now - (every + INTERVAL_GRACE_MS) && next > ran ? next : undefined
    }
  }
}
