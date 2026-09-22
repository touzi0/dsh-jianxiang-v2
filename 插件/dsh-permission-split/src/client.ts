/**
 * dsh-permission-split —— 客户端半边（坚祥定制）。
 *
 * 现状：**尚未实现**。宿主半边（`src/index.ts`）已可用；这里先给出一个不自作主张的
 * 空实现，让 `dsh.client` 清单引用的 `lib/client.js` 存在、浏览器侧装载不报错。
 *
 * 待实现（需要官方两个 UI 组件的替代品）：
 *   1. 权限菜单两列化——`replaces: ["ui-permission"]` 让官方那行让位，
 *      由本模组注册 `conversation.input.permission`：
 *      左列照抄官方 `PermissionSelect` 的预设单选样式（不改变现有观感），
 *      右列三项能力用方框多选，数据走 `jxPermission` Remote。
 *   2. 审批弹窗第三个按钮——官方 `ApprovalDecision` 是
 *      `'allowed-once' | 'rejected'` 两值联合，需要先扩这个签约类型，
 *      再按 v1 的做法仅在沙箱升级类审批上渲染「本对话中始终允许」。
 */
import type { Context } from '@deepseek-ai/cordis'

/** 客户端半边插件名。 */
export const name = 'dsh-permission-split-client'

/**
 * 客户端半边装载入口。
 * @param _ctx - 浏览器侧 Host 上下文。
 */
export function apply(_ctx: Context): void {
  // 空实现：UI 贡献待实现，见本文件头部说明。
}

export default { name, apply }
