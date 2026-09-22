/**
 * 安全审查记录标签页组件。
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { ReviewRecord } from './types.ts'

interface SessionsState { current?: string }

const ACTION_LABEL: Record<ReviewRecord['action'], string> = {
  'ask-catastrophic': '灾难级·转人工',
  'ai-allow': 'AI 审查放行',
  'ai-ask': 'AI 审查·建议问人',
  'ai-error': 'AI 审查失败放行',
}

const ACTION_TONE: Record<ReviewRecord['action'], string> = {
  'ask-catastrophic': '#dc2626',
  'ai-allow': '#16a34a',
  'ai-ask': '#f59e0b',
  'ai-error': '#94a3b8',
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 4px' } satisfies CSSProperties,
  toolbar: { display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' } satisfies CSSProperties,
  actions: { display: 'flex', gap: 8 } satisfies CSSProperties,
  card: {
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: '10px 14px', borderRadius: 10,
    border: '1px solid color-mix(in srgb, currentColor 12%, transparent)',
  } satisfies CSSProperties,
  head: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } satisfies CSSProperties,
  time: { opacity: 0.6, fontSize: '0.8em' } satisfies CSSProperties,
  tag: { fontSize: '0.75em', padding: '1px 8px', borderRadius: 999, color: '#fff' } satisfies CSSProperties,
  cmd: {
    fontFamily: 'monospace', fontSize: '0.82em', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
    background: 'color-mix(in srgb, currentColor 7%, transparent)', borderRadius: 8, padding: '6px 10px',
  } satisfies CSSProperties,
  note: { fontSize: '0.88em', opacity: 0.85 } satisfies CSSProperties,
  detail: { fontSize: '0.8em', opacity: 0.65 } satisfies CSSProperties,
} as const

export function ReviewTab({
  useSessions, list, clear,
}: {
  useSessions: <T>(select: (state: SessionsState) => T) => T
  list: (limit: number) => Promise<ReviewRecord[]>
  clear: () => Promise<{ cleared: true }>
}): ReactNode {
  const [records, setRecords] = useState<ReviewRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [request, setRequest] = useState(0)
  void useSessions

  useEffect(() => {
    let cancelled = false
    list(200)
      .then(result => { if (!cancelled) { setRecords(result); setError(null) } })
      .catch(err => { if (!cancelled) setError(String(err)) })
    return () => { cancelled = true }
  }, [list, request])

  const refresh = (): void => setRequest(value => value + 1)
  const onClear = (): void => {
    void clear().then(refresh, refresh)
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.toolbar}>
        <span>{records === null ? '读取中…' : records.length === 0 ? '暂无记录（出现拦截/审查时自动记录）' : `共 ${records.length} 条`}</span>
        <div style={styles.actions}>
          <button type="button" onClick={refresh}>刷新</button>
          <button type="button" onClick={onClear} disabled={records === null || records.length === 0}>清空</button>
        </div>
      </div>
      {error !== null ? <div style={styles.note}>读取失败：{error}</div> : null}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(records ?? []).map((record, index) => (
          <li key={`${record.t}-${index}`} style={styles.card}>
            <div style={styles.head}>
              <span style={{ ...styles.tag, background: ACTION_TONE[record.action] }}>{ACTION_LABEL[record.action]}</span>
              <span style={styles.time}>{record.t.replace('T', ' ').slice(0, 19)}</span>
              <span style={styles.time}>{record.tool}</span>
            </div>
            <div style={styles.note}>{record.note}</div>
            <div style={styles.cmd}>{record.command}</div>
            {record.session !== '' ? <div style={styles.detail}>会话 {record.session}</div> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
