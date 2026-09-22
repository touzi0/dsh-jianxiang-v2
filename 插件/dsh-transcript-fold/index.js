/**
 * 折叠时机模组 —— 宿主半边。
 * 官方 ui-chat 行被本模组 replaces 掉，因此它的设置注册要在这里补回来：
 * `ui-chat` 命名空间的 transcriptView（normal | compact）是折叠总开关，
 * 缺了它客户端读不到 compact，整套折叠都不会发生。
 * schema 与官方 src/chat-settings.ts 逐字段一致（官方只导出常量，不导出 schema）。
 */
import z from '@deepseek-ai/schemastery'

/** 官方 Chat 设置命名空间。 */
const CHAT_SETTINGS_NAMESPACE = 'ui-chat'

/** 与官方 ChatSettingsSchema 等价的耐久 schema。 */
const ChatSettingsSchema = z.object({
  transcriptView: z.union(['normal', 'compact']).default('compact'),
})

/**
 * 注册 Chat 设置节。
 * @param ctx - 宿主根上下文。
 */
export function apply(ctx) {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(CHAT_SETTINGS_NAMESPACE, ChatSettingsSchema)
  })
}
