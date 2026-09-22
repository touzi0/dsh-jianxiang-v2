/**
 * dsh-permission-split —— 审批面板（坚祥定制）。
 *
 * 复制官方 `ApprovalPanel` 的结构与外观，唯一区别：**沙箱升级类审批**多一个
 * 「会话内始终允许」按钮。非升级审批保持两按钮，与官方一致。
 *
 * v1 的同一决策（见 .agents/notes/implemented/feature/2026-08-20-sandbox-always-allow）：
 * 仅在升级类审批上渲染第三个按钮，因为只有那条路径有可持久化的 knob。
 */
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PendingApproval } from './contract.ts'

/** 面板样式：取值照搬官方 ApprovalPanel.module.css。 */
const PANEL_STYLE = `
.jx-ap-root{display:flex;justify-content:center;width:100%}
.jx-ap-card{display:flex;flex-direction:column;gap:8px;width:100%;max-width:720px;padding:12px;border:1px solid var(--dsw-alias-border-secondary);border-radius:12px;background:var(--dsw-alias-bg-elevated)}
.jx-ap-strip{display:flex;align-items:center;gap:6px;font-size:12px;line-height:16px;color:var(--dsw-alias-label-caption)}
.jx-ap-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-warning)}
.jx-ap-body{display:flex;flex-direction:column;gap:6px;max-height:240px;overflow:auto}
.jx-ap-headline{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.jx-ap-command{padding:8px;border-radius:8px;background:var(--dsw-alias-bg-secondary);font-family:var(--dsw-font-mono,monospace);font-size:12px;line-height:18px;white-space:pre-wrap;word-break:break-all}
.jx-ap-actions{display:flex;justify-content:flex-end;gap:8px}
`

/**
 * 判定一次审批是否属于沙箱升级类请求。
 *
 * 沿用 v1 的做法：从请求方给出的 reason 文本识别升级语义
 * （v1 解析的是宿主中文 reason「请求将沙箱升级为「…」：…」）。
 * 只有升级类审批才有可持久化的 knob，故只有它显示「会话内始终允许」。
 * 识别不出时按非升级处理——宁可少显示一个按钮，也不给一个无效的承诺。
 *
 * @param reason - 请求方给出的理由文本。
 * @returns 是否按升级类渲染第三个按钮。
 */
export function isEscalationReason(reason: string | undefined): boolean {
  if (reason === undefined) return false
  return /沙箱|sandbox|升级|escalat|danger-full-access/u.test(reason)
}

/**
 * 渲染一次待审批；沙箱升级类多一个「会话内始终允许」。
 * @param props - 待审批项、可选详情、文案与升级判定。
 * @returns 审批接管面板。
 */
export function ApprovalPanel(props: {
  matched: PendingApproval
  detail: ReactNode
  t: (key: string, values?: Record<string, string>) => string
}): ReactNode {
  const { matched: pending, detail, t } = props
  const answer = (outcome: 'allowed-once' | 'allowed-always' | 'rejected'): void => {
    void pending.answer(outcome).catch(() => undefined)
  }
  const escalation = isEscalationReason(pending.reason)
  return (
    <div className="jx-ap-root" data-approval-key={pending.key}>
      <div className="jx-ap-card">
        <div className="jx-ap-strip"><span className="jx-ap-dot" />{t('waiting')}</div>
        <div className="jx-ap-body" data-approval-scroll="" tabIndex={0} role="group" aria-label={t('detail.aria')}>
          <div className="jx-ap-headline">
            {pending.reason ?? t('escalation', { toolName: pending.toolName })}
          </div>
          {detail !== null && <div className="jx-ap-command">{detail}</div>}
        </div>
        <div className="jx-ap-actions">
          <Button variant="outline" onClick={() => { answer('rejected') }}>{t('reject')}</Button>
          <Button variant="outline" onClick={() => { answer('allowed-once') }}>{t('allowOnce')}</Button>
          {escalation && (
            <Button variant="primary" onClick={() => { answer('allowed-always') }}>{t('allowAlways')}</Button>
          )}
        </div>
      </div>
    </div>
  )
}

/** 导出面板样式，由入口挂进 document.head。 */
export { PANEL_STYLE }
