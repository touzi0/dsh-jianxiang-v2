/**
 * 摘要折叠自测（`node selftest-summary.mts`，需要 Node 24 的类型擦除）。
 * 只跑纯函数，不碰宿主服务；模组改动后用来回归「摘要没把思考/参数带出去」这类约束。
 */
import { summarizeSession, renderSummaryText } from './src/summary.ts'

const events = [
  { type: 'turn/start', seq: 1, time: 1_000, data: { turn: 1 } },
  { type: 'assistant/message', seq: 2, time: 1_500, data: { turn: 1, step: 1, message: { content: [
    { type: 'reasoning', text: '先看目录' },
    { type: 'text', text: '我先看一下目录结构。' },
    { type: 'tool-call', callId: 'c1', name: 'glob' },
  ] } } },
  { type: 'step/end', seq: 3, data: { turn: 1, step: 1 } },
  { type: 'tool/call', seq: 4, data: { turn: 1, step: 1, callId: 'c1', name: 'glob', arguments: '{"pattern":"**/*.ts"}' } },
  { type: 'tool/result', seq: 5, data: { turn: 1, step: 1, message: { source: { callId: 'c1' }, content: [] } } },
  { type: 'tool/call', seq: 6, data: { turn: 1, step: 1, callId: 'c2', name: 'write', arguments: '{"file_path":"src/a.ts","content":"x"}' } },
  { type: 'tool/result', seq: 7, data: { turn: 1, step: 1, message: { source: { callId: 'c2' }, content: [] }, meta: { operation: 'create' } } },
  { type: 'tool/call', seq: 8, data: { turn: 1, step: 1, callId: 'c3', name: 'edit', arguments: '{"file_path":"src/b.ts","old_string":"a","new_string":"b"}' } },
  { type: 'tool/result', seq: 9, data: { turn: 1, step: 1, message: { source: { callId: 'c3' }, content: [], isError: true }, error: { code: 'x' } } },
  { type: 'assistant/message', seq: 10, time: 2_500, data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: '做完了，结果在 src/a.ts。' }] } } },
  { type: 'step/end', seq: 11, data: { turn: 1, step: 2 } },
  { type: 'turn/end', seq: 12, time: 31_000, data: { turn: 1, reason: { kind: 'completed' } } },
]

const summary = summarizeSession(events as never)
const serialized = JSON.stringify(summary)

const checks: [string, boolean][] = [
  ['轮数为 1', summary.turns === 1],
  ['步数为 2', summary.steps === 2],
  ['带思考的步数为 1', summary.reasoningSteps === 1],
  ['工具调用按首次出现顺序：glob、write、edit', summary.toolCalls.map(tool => `${tool.name}×${tool.count}`).join(',') === 'glob×1,write×1,edit×1'],
  ['成功的写文件入列（新增）', summary.changedFiles.length === 1 && summary.changedFiles[0]?.path === 'src/a.ts' && summary.changedFiles[0]?.op === 'create'],
  ['失败的 edit 不入列', !summary.changedFiles.some(file => file.path === 'src/b.ts')],
  ['中间正文只留最后一条', summary.middleTexts.length === 1 && summary.middleTexts[0] === '我先看一下目录结构。'],
  ['最终答复是第一轮最后一条正文', summary.finalText === '做完了，结果在 src/a.ts。'],
  ['结束原因正常', summary.stopReason === 'completed'],
  ['摘要不含思考内容', !serialized.includes('先看目录')],
  ['摘要不含工具参数', !serialized.includes('old_string') && !serialized.includes('new_string') && !serialized.includes('**/*.ts')],
]

console.log(renderSummaryText(summary, {
  sessionId: 'session-demo',
  title: '示例任务',
  workspaceTitle: '停机产量分析',
  task: '把停机时间按班次汇总',
}))
console.log('')

let failed = 0
for (const [label, ok] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
}
console.log(failed === 0 ? `全部通过（${checks.length} 项）` : `${failed}/${checks.length} 项失败`)
if (failed > 0) process.exitCode = 1
