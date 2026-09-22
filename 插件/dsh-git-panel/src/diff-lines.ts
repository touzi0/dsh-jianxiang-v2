/**
 * unified diff 的行分类（浏览器半边与自测共用）。
 * 宿主原样返回 git 的 diff 文本，呈现侧只按行前缀分类，不解析文件语义。
 */

/** diff 文本里一行的渲染类别。 */
export type DiffLineKind = 'add' | 'del' | 'hunk' | 'meta' | 'context'

/**
 * 判定 unified diff 一行的类别。
 * @param line - 含前缀的原始行。
 * @returns 渲染类别。
 */
export function diffLineKind(line: string): DiffLineKind {
  if (line.startsWith('@@')) return 'hunk'
  if (line.startsWith('+++') || line.startsWith('---')) return 'meta'
  if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('new file ')
    || line.startsWith('deleted file ') || line.startsWith('similarity ') || line.startsWith('rename ')
    || line.startsWith('old mode ') || line.startsWith('new mode ') || line.startsWith('\\ ')) return 'meta'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  return 'context'
}
