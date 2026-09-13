/** 坚祥模组管理器的界面文案。 */

/** 简体中文词典与键的唯一来源。 */
export const zh = {
  tab: '坚祥模组',
  loading: '正在读取模组…',
  error: '暂时无法读取模组。',
  retry: '重试',
  rescan: '重新扫描',
  empty: '插件\\ 文件夹里还没有模组。',
  enabled: '已启用',
  disabled: '已停用',
  clientTag: '含界面',
  replacesTag: '替换原生：{ids}',
  overridesTag: '覆盖配置：{ids}',
  entryMissing: '入口缺失',
  restartBanner: '开关已变更，重启服务后生效。',
  toggleOn: '停用',
  toggleOff: '启用',
  patchFileLabel: '补丁层文件',
  toggleFailed: '操作失败',
} satisfies Record<string, string>

export type JxModsLocaleKey = keyof typeof zh

/** 英文词典（键集合与中文一致）。 */
export const en = {
  tab: 'JX mods',
  loading: 'Reading mods…',
  error: 'Mods are temporarily unavailable.',
  retry: 'Retry',
  rescan: 'Rescan',
  empty: 'No mods in the 插件\\ folder yet.',
  enabled: 'Enabled',
  disabled: 'Disabled',
  clientTag: 'with UI',
  replacesTag: 'Replaces native: {ids}',
  overridesTag: 'Overrides config: {ids}',
  entryMissing: 'entry missing',
  restartBanner: 'Toggles changed. Restart the server to apply.',
  toggleOn: 'Disable',
  toggleOff: 'Enable',
  patchFileLabel: 'Patch layer file',
  toggleFailed: 'Operation failed',
} satisfies Record<JxModsLocaleKey, string>
