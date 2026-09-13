/** ISO 形态的时间戳格式化（与旧 env-context 相同的稳定格式）。 */

type TimestampPart = 'day' | 'hour' | 'minute' | 'month' | 'second' | 'timeZoneName' | 'year'

export function createTimestampFormatter(timeZone?: string, includeSeconds = false): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    ...(timeZone === undefined ? {} : { timeZone }),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' as const } : {}),
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  })
}

export function formatTimestamp(
  now: number,
  formatter: Intl.DateTimeFormat,
  timeZone: string,
  includeSeconds = false,
): string {
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map(part => [part.type, part.value]),
  ) as Record<TimestampPart, string>
  const offset = parts.timeZoneName.replace(/^GMT$/, 'GMT+00:00').slice(3)
  const seconds = includeSeconds ? `:${parts['second']}` : ''
  return `${parts['year']}-${parts['month']}-${parts['day']}T${parts['hour']}:${parts['minute']}${seconds}${offset}[${timeZone}]`
}
