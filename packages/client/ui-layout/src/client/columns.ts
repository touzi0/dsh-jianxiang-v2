/**
 * Normal column geometry: the right column shrinks, then loses its track,
 * before the center drops below its minimum. The sidebar never concedes here;
 * AppFrame supplies its effective preference after responsive collapse.
 *
 * A user-dragged right panel width is a preference and reserves a track; the
 * first-open width is derived instead — the space the conversation's content
 * leaves at the frame's right edge (`remainingWidth`) — and reserves no track,
 * so opening the panel never moves the conversation.
 */

/** Resolved widths for one frame. */
export interface Columns { sidebar: number; center: number; rightbar: number }

/** Center width protected while the normal right column is open. */
export const CENTER_MIN = 400
/** Sidebar drag clamp floor. */
export const SIDEBAR_MIN = 264
/** Sidebar drag clamp ceiling. */
export const SIDEBAR_MAX = 420
/** Sidebar width before any user drag. */
export const SIDEBAR_DEFAULT = 280
/** Closed-sidebar rail: a 24px icon column between 16px horizontal paddings. */
export const SIDEBAR_COLLAPSED = 56
/** Viewport width below which the sidebar auto-collapses to the rail (deepsuite
 * LG breakpoint); a manual toggle below it re-expands over the squeezed center
 * (stores.ts narrowExpanded). */
export const SIDEBAR_AUTO_COLLAPSE = 1024
/** Right column drag clamp floor. */
export const RIGHTBAR_MIN = 300
/** Maximum normal right panel width as a fraction of the frame. */
export const RIGHTBAR_MAX_RATIO = 0.7
/** First-open right panel width as a fraction of the frame, used only when the
 * conversation leaves less space than the panel's minimum. */
export const RIGHTBAR_DEFAULT_RATIO = 0.45
/** Gutter kept between the conversation's content edge and a first-open panel
 * (the conversation's own width handle rides 24px outside the content column). */
export const RIGHTBAR_CONTENT_GUTTER = 24

/**
 * Space the conversation leaves between its content column's right edge and the
 * frame's right edge: the first-open panel width, taken without moving the
 * conversation.
 * @param frameRight - the frame's right edge, in viewport coordinates.
 * @param contentRight - the conversation content column's right edge, in viewport coordinates.
 * @returns the width in px, floored at zero for a content column at or past the edge.
 */
export function remainingWidth(frameRight: number, contentRight: number): number {
  return Math.max(0, Math.round(frameRight - contentRight - RIGHTBAR_CONTENT_GUTTER))
}

/** localStorage key of the user's dragged transcript width preference (ui-conversation owns it). */
export const CONTENT_WIDTH_STORAGE_KEY = 'dsh.conversation.contentWidth'

/**
 * The conversation's content-axis width, mirroring ui-conversation's own rule
 * (`resolveContentWidth` in ConversationWidthControls): a stored preference
 * clamped to the column, else 64% of the column clamped to 680–920. The frame
 * uses it to derive the panel's width when the centre occupant publishes no
 * measurable content column (no session yet, non-chat view), so the panel then
 * still fills the real gap instead of a frame ratio.
 * @param columnWidth - the conversation column's width in px.
 * @param preference - the user's stored width preference in px, or null.
 * @returns the content-axis width in px.
 */
export function conversationContentWidth(columnWidth: number, preference: number | null): number {
  const max = Math.max(640, columnWidth - 176)
  if (preference !== null) return Math.min(Math.max(preference, 640), max)
  return Math.max(680, Math.min(columnWidth * 0.64, 920))
}

/**
 * Clamp a panel width into its contract range.
 * @param px - requested width.
 * @param min - range lower bound.
 * @param max - range upper bound.
 * @returns the clamped width.
 */
export function clampWidth(px: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(px)))
}

/**
 * Solve the three column widths for one viewport frame.
 * @param viewport - available frame width in px.
 * @param sidebar - sidebar width preference in px (0 = closed).
 * @param rightbar - requested right panel width in px (0 = no track).
 * @param collapsedWidth - track width of the closed sidebar; the default keeps
 *   the icon rail, 0 hides the column entirely (macOS desktop).
 * @returns actual widths after shrinking or removing the right track; only
 *   without that track may the center fall below its minimum, down to zero.
 */
export function computeColumns(viewport: number, sidebar: number, rightbar: number, collapsedWidth = SIDEBAR_COLLAPSED): Columns {
  const s = sidebar === 0 ? collapsedWidth : clampWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)
  const available = viewport - s - CENTER_MIN
  const r = rightbar === 0 || available < RIGHTBAR_MIN
    ? 0
    : Math.min(available, clampWidth(rightbar, RIGHTBAR_MIN, viewport * RIGHTBAR_MAX_RATIO))
  return { sidebar: s, center: Math.max(0, viewport - s - r), rightbar: r }
}
