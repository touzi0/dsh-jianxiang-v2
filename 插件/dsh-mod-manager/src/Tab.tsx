/** 坚祥模组标签页：官方行式布局（标题+描述+标签 | 右侧 Switch 开关），复用 ui-primitives。 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Button, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import type { JxModRow, JxModsSnapshot } from './types.ts'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** 注册侧注入的 Remote 面（框架会把成员平铺为顶层 props）。 */
export interface JxModsTabInjected {
  list: () => Promise<JxModsSnapshot>
  setEnabled: (id: string, enabled: boolean) => Promise<{ restartNeeded: boolean }>
  rescan: () => Promise<JxModsSnapshot>
}

/** 完整组件属性（由 Settings 槽渲染器组装）。 */
export type JxModsTabProps = PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.jxMods'>
  & JxModsTabInjected

/**
 * 布局复刻官方设置行规范（LanguageRow.module.css）：
 * 行内 flex 居中、上下 16px、0.5px hairline 分隔线、rowText 竖排 gap 4。
 * 颜色一律引用官方 --dsw-* 设计令牌，随浅色/深色主题自动切换。
 */
const row = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0',
  borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
} satisfies CSSProperties
const rowText = {
  flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, paddingRight: 48,
} satisfies CSSProperties
const title = { fontWeight: 600 } satisfies CSSProperties
const sub = {
  opacity: 0.75, fontSize: '0.85em', wordBreak: 'break-all',
  color: 'var(--dsw-alias-text-secondary, inherit)',
} satisfies CSSProperties
const tags = { display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' } satisfies CSSProperties
const toolbar = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0 4px',
} satisfies CSSProperties
const banner = {
  padding: '8px 12px', borderRadius: 8, marginBottom: 4,
  background: 'color-mix(in srgb, orange 14%, transparent)',
} satisfies CSSProperties
const footer = {
  padding: '12px 0 16px', fontSize: '0.8em', wordBreak: 'break-all',
  color: 'var(--dsw-alias-text-tertiary, inherit)', opacity: 0.7,
} satisfies CSSProperties

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly snapshot: JxModsSnapshot; readonly dirty: boolean; readonly busy: string | null }

/** 一个模组行的状态标签配色。 */
function stateTone(enabled: boolean): TagTone {
  return enabled ? 'success' : 'neutral'
}

/** 坚祥模组设置页。 */
export function JxModsTab({ t, list, setEnabled, rescan }: JxModsTabProps): ReactNode {
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [request, setRequest] = useState(0)

  useEffect(() => {
    let cancelled = false
    list()
      .then(snapshot => {
        if (cancelled) return
        setState(previous => previous.status === 'ready' && previous.snapshot.mods.length === snapshot.mods.length
          ? { ...previous, snapshot }
          : { status: 'ready', snapshot, dirty: false, busy: null })
      })
      .catch(error => { if (!cancelled) setState({ status: 'error', message: String(error) }) })
    return () => { cancelled = true }
  }, [list, request])

  const toggle = (row0: JxModRow, next: boolean): void => {
    if (state.status !== 'ready') return
    setState({ ...state, busy: row0.id })
    setEnabled(row0.id, next)
      .then(() => list())
      .then(snapshot => setState({ status: 'ready', snapshot, dirty: true, busy: null }))
      .catch(error => setState({ status: 'error', message: `${t('toggleFailed')}: ${String(error)}` }))
  }

  const onRescan = (): void => {
    setState({ status: 'loading' })
    rescan()
      .then(snapshot => setState({ status: 'ready', snapshot, dirty: false, busy: null }))
      .catch(error => setState({ status: 'error', message: String(error) }))
  }

  if (state.status === 'loading') return <div style={{ padding: '16px 0' }}>{t('loading')}</div>
  if (state.status === 'error') {
    return (
      <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
        <div>{t('error')} <code>{state.message}</code></div>
        <Button variant="outline" size="sm" onClick={() => setRequest(value => value + 1)}>{t('retry')}</Button>
      </div>
    )
  }

  const { snapshot, dirty, busy } = state
  return (
    <div>
      {/* 开启态蓝色覆盖（官方 Switch 默认开启色为深色）；与 dsh-speech 设置页同款 */}
      <style>{'.jx-blue-switch[aria-checked="true"]{background:#4d6bfe}'}</style>
      <div style={toolbar}>
        <span style={sub}>{snapshot.mods.length > 0 ? `${snapshot.mods.length}` : t('empty')}</span>
        <Button variant="outline" size="sm" onClick={onRescan}>{t('rescan')}</Button>
      </div>
      {dirty ? <div style={banner}>{t('restartBanner')}</div> : null}
      {snapshot.mods.map(row0 => (
        <div key={row0.id} style={row}>
          <div style={rowText}>
            <span style={title}>
              {row0.name}
              {row0.version ? <span style={sub}>{` ${row0.version}`}</span> : null}
            </span>
            {row0.description ? <span style={sub}>{row0.description}</span> : null}
            <div style={tags}>
              <Tag tone={stateTone(row0.enabled)}>{row0.enabled ? t('enabled') : t('disabled')}</Tag>
              {row0.hasClient ? <Tag tone="info">{t('clientTag')}</Tag> : null}
              {row0.replaces.length > 0
                ? <Tag tone="quiet">{t('replacesTag', { ids: row0.replaces.join(', ') })}</Tag>
                : null}
              {row0.overrides.length > 0
                ? <Tag tone="quiet">{t('overridesTag', { ids: row0.overrides.map(item => item.id).join(', ') })}</Tag>
                : null}
              {row0.entry === '' ? <Tag tone="danger">{t('entryMissing')}</Tag> : null}
            </div>
          </div>
          <Switch
            className="jx-blue-switch"
            checked={row0.enabled}
            disabled={busy === row0.id || row0.entry === ''}
            onChange={next => { toggle(row0, next) }}
            label={`${row0.name} ${row0.enabled ? t('enabled') : t('disabled')}`}
          />
        </div>
      ))}
      <div style={footer}>{t('patchFileLabel')}: <code>{snapshot.patchFile}</code></div>
    </div>
  )
}
