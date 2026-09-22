/**
 * Normal column geometry: the right column shrinks, then loses its track,
 * before the center drops below its minimum. The sidebar never concedes here;
 * AppFrame supplies its effective preference after responsive collapse.
 *
 * The right panel's width is never stored as its own preference. It is always
 * the space the conversation's content column leaves in the closed centre —
 * `conversationTrack` — so every opening fills exactly that gap. Dragging the
 * panel's handle instead adjusts the conversation's content-width preference
 * (shared with ui-conversation's own width handles), which widens or narrows
 * the gap and therefore the panel, and is remembered for the next opening.
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
/** Horizontal room the conversation reserves for its own width handles and safe
 * edge zones, mirrored from ui-conversation (`CONTENT_EDGE_BUDGET`): with a
 * stored preference the content column never comes closer than 88px per side to
 * its column's edges, which is also the gap the panel keeps to the content. */
export const CONTENT_EDGE_BUDGET = 176
/** localStorage key of the user's dragged transcript width preference (ui-conversation owns it). */
export const CONTENT_WIDTH_STORAGE_KEY = 'dsh.conversation.contentWidth'
/** Drag clamp for the conversation's content-width preference. */
export const CONTENT_MIN = 640
export const CONTENT_MAX = 2400

/**
 * The conversation's content-axis width, mirroring ui-conversation's own rule
 * (`resolveContentWidth` in ConversationWidthControls): a stored preference
 * clamped to the column, else 64% of the column clamped to 680–920.
 * @param columnWidth - the conversation column's width in px.
 * @param preference - the user's stored width preference in px, or null.
 * @returns the content-axis width in px.
 */
export function conversationContentWidth(columnWidth: number, preference: number | null): number {
  const max = Math.max(CONTENT_MIN, columnWidth - CONTENT_EDGE_BUDGET)
  if (preference !== null) return Math.min(Math.max(preference, CONTENT_MIN), max)
  return Math.max(680, Math.min(columnWidth * 0.64, 920))
}

/**
 * The right panel's track width: the whole space the conversation's content
 * column leaves in the closed centre, edges budget included. Opening the panel
 * narrows the centre to content + budget, so the content keeps its width
 * (its preference survives ui-conversation's clamp exactly) and the panel fills
 * the rest.
 * @param viewport - available frame width in px.
 * @param sidebar - resolved sidebar width in px.
 * @param contentWidth - the conversation's content-axis width in px.
 * @returns the track width in px, floored at zero.
 */
export function conversationTrack(viewport: number, sidebar: number, contentWidth: number): number {
  return Math.max(0, Math.round(viewport - sidebar - contentWidth - CONTENT_EDGE_BUDGET))
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
