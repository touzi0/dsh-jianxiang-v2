/** dsh-manual-compact 的界面文案。 */

/** 词典命名空间（locale.register / locale.bind 用）。 */
export const NS = 'jx-manual-compact'

/** 简体中文词典与键的唯一来源。 */
export const zh = {
  action: '压缩到此轮为止',
  running: '正在压缩…',
  dialogTitle: '压缩此轮及之前的对话',
  dialogBody: '将把第 {turn} 轮及其之前的全部对话压缩成一份摘要，这一轮之后的对话保持不变。压缩使用本会话的官方上下文压缩机制，会改动会话上下文，且不能自动撤销。',
  confirm: '开始压缩',
  cancel: '取消',
  close: '关闭',
  done: '已完成：压掉 {count} 条记录（约 {tokens} tokens），摘要 {chars} 字。这一轮之后的对话原样保留，会话可以继续正常对话。',
  failed: '压缩没有执行',
} satisfies Record<string, string>

export type ManualCompactLocaleKey = keyof typeof zh

/** 英文词典（键集合与中文一致）。 */
export const en = {
  action: 'Compact up to here',
  running: 'Compacting…',
  dialogTitle: 'Compact this turn and earlier',
  dialogBody: 'Everything up to and including turn {turn} will be compacted into one summary; later turns stay untouched. This uses the session\'s official compaction, changes the conversation context, and cannot be undone automatically.',
  confirm: 'Compact now',
  cancel: 'Cancel',
  close: 'Close',
  done: 'Done: {count} history items compacted (~{tokens} tokens), summary is {chars} characters. Later turns are untouched and the session keeps working.',
  failed: 'Compaction did not run',
} satisfies Record<ManualCompactLocaleKey, string>
