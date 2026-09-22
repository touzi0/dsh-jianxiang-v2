/**
 * 调度纯函数自测：`computeNextRunAt` / `computeDueSlot` / `detectMissed` 的
 * 时间边界（不提前、不重复、错过只提示最近一次、间隔类落后不自动追）。
 * 跑法：`node selftest-schedule.mts`。
 */
import {
  computeDueSlot, computeNextRunAt, detectMissed, lastDailySlot, lastWeeklySlot, parseTimeToMinutes,
} from './src/schedule.ts'
import type { Schedule } from './src/types.ts'

const checks: [string, boolean][] = []
const record = (label: string, ok: boolean): void => { checks.push([label, ok]) }
const eq = (label: string, actual: unknown, expected: unknown): void => {
  record(`${label}（实际 ${String(actual)}，期望 ${String(expected)}）`, actual === expected)
}

// 基准：2026-09-22 是周二；全部用本地时区构造。
const TUE = new Date(2026, 8, 22, 13, 0, 0, 0).getTime() // 周二 13:00
const at = (monthZeroBased: number, day: number, hour: number, minute: number): number =>
  new Date(2026, monthZeroBased, day, hour, minute, 0, 0).getTime()
const DAY = 86_400_000

record('2026-09-22 确实是周二（自检基准）', new Date(TUE).getDay() === 2)

// ---- parseTimeToMinutes ----
eq(`parseTime('09:30')`, parseTimeToMinutes('09:30'), 570)
eq(`parseTime('9:05')`, parseTimeToMinutes('9:05'), 545)
eq(`parseTime('24:00')`, parseTimeToMinutes('24:00'), undefined)
eq(`parseTime('ab')`, parseTimeToMinutes('ab'), undefined)

// ---- computeNextRunAt ----
const NOW_PLUS = TUE + 3_600_000
eq('manual 永不排程', computeNextRunAt({ kind: 'manual' }, TUE, undefined), undefined)
eq('once 未来时间', computeNextRunAt({ kind: 'once', at: NOW_PLUS }, TUE, undefined), NOW_PLUS)
eq('once 已过期', computeNextRunAt({ kind: 'once', at: TUE - 1 }, TUE, undefined), undefined)
eq('daily 今天未到时刻', computeNextRunAt({ kind: 'daily', time: '21:00' }, TUE, undefined), at(8, 22, 21, 0))
eq('daily 今天已过时刻 → 明天', computeNextRunAt({ kind: 'daily', time: '09:00' }, TUE, undefined), at(8, 23, 9, 0))
eq('weekdays 周二 13:00 → 周三 09:00', computeNextRunAt({ kind: 'weekdays', time: '09:00' }, TUE, undefined), at(8, 23, 9, 0))
const FRI = new Date(2026, 8, 25, 18, 0, 0, 0).getTime()
record('2026-09-25 确实是周五（自检基准）', new Date(FRI).getDay() === 5)
eq('weekdays 周五 18:00 跨周末 → 下周一', computeNextRunAt({ kind: 'weekdays', time: '09:00' }, FRI, undefined), at(8, 28, 9, 0))
eq('weekly 周一集 → 下周一', computeNextRunAt({ kind: 'weekly', days: [1], time: '08:00' }, TUE, undefined), at(8, 28, 8, 0))
eq('weekly 空天集永不排程', computeNextRunAt({ kind: 'weekly', days: [], time: '08:00' }, TUE, undefined), undefined)
eq('weekly 周二集今天时刻已过 → 下周二', computeNextRunAt({ kind: 'weekly', days: [2], time: '09:00' }, TUE, undefined), at(8, 29, 9, 0))
eq('interval 有 lastRunAt → 加一个周期', computeNextRunAt({ kind: 'interval', everyMinutes: 15 }, TUE, TUE - 10 * 60_000), TUE + 5 * 60_000)
eq('interval 无 lastRunAt → 从 now 起算', computeNextRunAt({ kind: 'interval', everyMinutes: 15 }, TUE, undefined), TUE + 15 * 60_000)
eq('interval 非法周期', computeNextRunAt({ kind: 'interval', everyMinutes: 0 }, TUE, undefined), undefined)

// ---- lastDailySlot / lastWeeklySlot（检测用的「最近一个已过槽点」） ----
eq('lastDailySlot 今天已过 → 今天', lastDailySlot(TUE, 540), at(8, 22, 9, 0))
eq('lastDailySlot 今天未到 → 昨天', lastDailySlot(at(8, 22, 8, 0) + 1, 540), at(8, 21, 9, 0))
eq('lastWeeklySlot 周二集 → 今天', lastWeeklySlot(TUE, [2], 540), at(8, 22, 9, 0))
eq('lastWeeklySlot 周五集 → 上周五', lastWeeklySlot(TUE, [5], 540), at(8, 18, 9, 0))

// ---- computeDueSlot（调度循环：只认刚到的槽点） ----
const due = (schedule: Schedule, now: number, lastRunAt: number | undefined, anchor = TUE - 7 * DAY): number | undefined =>
  computeDueSlot(schedule, now, lastRunAt, anchor)

const daily21: Schedule = { kind: 'daily', time: '21:00' }
eq('daily 未到时刻不触发', due(daily21, at(8, 22, 20, 59), at(8, 21, 21, 0)), undefined)
eq('daily 槽点刚到触发', due(daily21, at(8, 22, 21, 0) + 30_000, at(8, 21, 21, 0)), at(8, 22, 21, 0))
eq('daily 槽点在新鲜窗口内（tick 晚了几分钟）仍触发', due({ kind: 'daily', time: '09:00' }, at(8, 22, 9, 2), at(8, 21, 9, 0)), at(8, 22, 9, 0))
eq('daily 同一槽点不重复触发', due(daily21, at(8, 22, 21, 1), at(8, 22, 21, 0)), undefined)
eq('daily 昨天错过的不由 tick 自动追', due({ kind: 'daily', time: '09:00' }, TUE, at(8, 21, 9, 0)), undefined)
eq('weekly 今天不匹配不触发', due({ kind: 'weekly', days: [1], time: '09:00' }, TUE, undefined), undefined)
eq('weekly 今天匹配且已到触发', due({ kind: 'weekly', days: [2], time: '13:00' }, TUE + 60_000, TUE - 7 * DAY), at(8, 22, 13, 0))
eq('weekdays 周末不触发', due({ kind: 'weekdays', time: '09:00' }, new Date(2026, 8, 26, 10, 0, 0, 0).getTime(), undefined), undefined)
eq('once 时间未到不触发', due({ kind: 'once', at: TUE + 60_000 }, TUE, undefined), undefined)
eq('once 到点触发', due({ kind: 'once', at: TUE }, TUE + 1000, undefined), TUE)
const interval30: Schedule = { kind: 'interval', everyMinutes: 30 }
eq('interval 节拍未到不触发', due(interval30, TUE, TUE - 20 * 60_000), undefined)
eq('interval 节拍到且在一个周期内 → 追上', due(interval30, TUE + 35 * 60_000, TUE, TUE), TUE + 30 * 60_000)
eq('interval 落后超过一个周期不自动追', due(interval30, TUE + 3 * 3_600_000, TUE, TUE), undefined)
eq('interval 无基准 → 从 anchor 起算未到', due(interval30, TUE, undefined, TUE), undefined)

// ---- detectMissed（服务没开着时错过的最近一个槽点） ----
const missed = (schedule: Schedule, now: number, lastRunAt: number | undefined, anchor = TUE - 7 * DAY): number | undefined =>
  detectMissed(schedule, now, lastRunAt, anchor)

eq('manual 无错过', missed({ kind: 'manual' }, TUE, undefined), undefined)
eq('once 已错过且未处理', missed({ kind: 'once', at: TUE - 3_600_000 }, TUE, undefined), TUE - 3_600_000)
eq('once 未到不算错过', missed({ kind: 'once', at: TUE + 3_600_000 }, TUE, undefined), undefined)
eq('once 已处理不算错过', missed({ kind: 'once', at: TUE - 3_600_000 }, TUE, TUE - 3_600_000), undefined)
eq('daily 错过今天的 → 最近一次（今天）', missed({ kind: 'daily', time: '09:00' }, TUE, at(8, 21, 9, 0)), at(8, 22, 9, 0))
eq('daily 没错过', missed({ kind: 'daily', time: '21:00' }, at(8, 22, 20, 0), at(8, 21, 21, 0)), undefined)
eq('weekly 错过本周的 → 本周二早上', missed({ kind: 'weekly', days: [2], time: '09:00' }, TUE, at(8, 15, 21, 0)), at(8, 22, 9, 0))
eq('weekdays 错过 → 今天（周二）早上', missed({ kind: 'weekdays', time: '09:00' }, TUE, at(8, 21, 9, 0)), at(8, 22, 9, 0))
eq('interval 落后一个周期内不算错过', missed(interval30, TUE + 35 * 60_000, TUE, TUE), undefined)
eq('interval 落后超过一个周期 → 最近节拍', missed(interval30, TUE + 3 * 3_600_000, TUE, TUE), TUE + 30 * 60_000)
eq('interval 新任务（anchor=now）不算错过', missed(interval30, TUE, undefined, TUE), undefined)

let failed = 0
for (const [label, ok] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? '✓' : '✗'} ${label}`)
}
console.log(`\n${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) process.exit(1)
