/**
 * dsh-image-relay —— 图片代理插件（宿主半边，纯 ESM 手写产物，无需构建）。
 *
 * 职责只有两件事：
 *
 * 1. view_image 工具 —— 不具备看图能力的模型在对话里收到的是官方核心生成的图片占位符
 *    （"[image omitted ... attachment sha256:<digest>]"）；模型需要看图时，从占位符取附件
 *    摘要调用本工具，插件从当前会话表层挖出持久图片引用，转发给视觉模型（配置指定，或
 *    自动挑选 inputModalities 含 image 的模型），把识别出的文字结果返回给模型。
 *
 * 2. 一小段系统提示 —— 教模型认识占位符并主动调工具（视觉模型看不到占位符，提示无害）。
 *
 * 注意：占位符替换本身是官方 dsh-llm 核心的内置能力（模型声明 input 不含 image 时自动
 * 生效），不在本插件里。请确保各网关目录把不支持图片的模型如实声明为纯文本——此前
 * glm-5.3 被误声明为 [text, image] 导致图片被直发、网关 400（code 1210），修正见
 * dsh-home/settings.yaml（2026-09-23）。
 */

import z from '@deepseek-ai/schemastery'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-image-relay'
export const inject = ['tools']

/** 宿主配置（模组挂载行的 config）。全部可选。 */
export const Config = z.object({
  visionProvider: z.string().description('视觉模型提供方 id；留空则自动挑选第一个支持图片的模型'),
  visionModel: z.string().description('视觉模型 id；留空则自动挑选'),
  maxAnswerChars: z.number().description('识别结果返回给模型的最大字符数，默认 8000'),
})

/** view_image 工具的单次识别超时。 */
const VISION_TIMEOUT_MS = 120_000
/** 识别结果默认截断长度。 */
const DEFAULT_MAX_ANSWER_CHARS = 8000

/** 教模型认识占位符并主动用工具的系统提示段。 */
const PLACEHOLDER_HINT = [
  '（图片占位符说明：你看到形如 "[image omitted ... attachment sha256:<digest>]" 的文本时，',
  '它代表用户发送的一张图片——你当前不能直接查看图片内容。需要了解图片时，调用 view_image',
  '工具并传入其中的附件摘要；工具会把图片交给一个视觉模型识别，并把文字结果返回给你。',
  '用户提到截图、照片、图表、界面、报错画面等而你只看到占位符时，应当主动调用该工具。）',
].join('')

/** llm 服务面（按使用到的成员声明）。 */
const llmFace = (ctx) => ctx.get('llm')

/**
 * 解析视觉模型路由：优先显式配置，否则遍历提供方找 inputModalities 含 image 的模型。
 * @param ctx - 插件上下文。
 * @param config - 插件配置。
 * @returns provider/model 路由。
 */
async function resolveVisionRoute(ctx, config) {
  const llm = llmFace(ctx)
  if (llm === undefined) throw new Error('dsh-image-relay: llm service unavailable')
  if (config.visionProvider !== undefined && config.visionProvider !== ''
    && config.visionModel !== undefined && config.visionModel !== '') {
    return { provider: config.visionProvider, model: config.visionModel }
  }
  for (const provider of llm.listProviders()) {
    try {
      const models = await llm.listModels(provider.id)
      for (const candidate of models) {
        if (candidate.inputModalities !== undefined && candidate.inputModalities.includes('image')) {
          return { provider: provider.id, model: candidate.id }
        }
      }
    } catch { /* 下一个 provider */ }
  }
  throw new Error('dsh-image-relay: no vision-capable model found; set visionProvider/visionModel in config')
}

/**
 * 调用视觉模型识别一张图片，返回文字结果。
 * @param ctx - 插件上下文。
 * @param route - 视觉模型路由。
 * @param ref - 持久图片附件引用。
 * @param question - 想让视觉模型回答的问题。
 * @param signal - 取消信号。
 * @returns 识别文字结果。
 */
async function runVisionModel(ctx, route, ref, question, signal) {
  const llm = llmFace(ctx)
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), VISION_TIMEOUT_MS)
  const combined = signal === undefined ? timeout.signal : AbortSignal.any([signal, timeout.signal])
  try {
    const prepared = await llm.prepareCall(route, combined)
    const message = createUserMessage({
      content: [
        { type: 'text', text: question },
        { type: 'image', attachment: ref },
      ],
      source: { kind: 'user' },
    })
    let out = ''
    for await (const chunk of prepared.stream({
      ...prepared.config,
      messages: [message],
      system: 'You are a vision assistant. Look at the image and answer the question in the same language as the question. Report exactly what is visible; say clearly when something is not visible or unreadable.',
      signal: combined,
    })) {
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') out += chunk.text
      else if (chunk.type === 'finish' && (chunk.reason?.kind === 'error' || chunk.reason?.kind === 'aborted')) {
        throw new Error('dsh-image-relay: vision model stream failed')
      }
    }
    const cleaned = out.trim()
    if (cleaned === '') throw new Error('dsh-image-relay: vision model returned empty answer')
    return cleaned
  } finally {
    clearTimeout(timer)
  }
}

/** 深度优先收集一条消息内容里的所有图片引用（含嵌套工具结果）。 */
function collectImageRefs(blocks, into) {
  for (const block of blocks) {
    if (block.type === 'image') into.push(block.attachment)
    else if (block.type === 'tool-result') collectImageRefs(block.content, into)
  }
}

/**
 * 从会话表层按附件 id（完整或摘要前缀）查找持久图片引用。
 * @param session - 调用工具的 agent 会话。
 * @param attachmentId - 模型提供的附件 id 或摘要前缀（含或不含 "sha256:"）。
 * @returns 匹配的图片引用数组。
 */
function findAttachmentRefs(session, attachmentId) {
  const needle = attachmentId.startsWith('sha256:') ? attachmentId : `sha256:${attachmentId}`
  const refs = []
  for (const seq of session.surface.nodes) {
    const event = session.eventAt(seq)
    if (event === undefined || (event.type !== 'user/message' && event.type !== 'tool/result')) continue
    const message = session.deriveEventMessage(event)
    if (message === undefined) continue
    collectImageRefs(message.content, refs)
  }
  return refs.filter(ref => String(ref.attachmentId).startsWith(needle))
}

/**
 * 挂载：注册 view_image 工具与系统提示段。
 * @param ctx - 插件上下文。
 * @param config - 插件配置。
 */
export function apply(ctx, config = {}) {
  const maxAnswerChars = typeof config.maxAnswerChars === 'number' && config.maxAnswerChars > 0
    ? config.maxAnswerChars : DEFAULT_MAX_ANSWER_CHARS
  let cachedRoute = (config.visionProvider !== undefined && config.visionProvider !== ''
    && config.visionModel !== undefined && config.visionModel !== '')
    ? { provider: config.visionProvider, model: config.visionModel } : null
  /** 视觉路由解析（显式配置固定；自动挑选结果成功后缓存，失败下次调用重试）。 */
  const route = async () => {
    if (cachedRoute === null) cachedRoute = await resolveVisionRoute(ctx, config)
    return cachedRoute
  }

  // 系统提示段：教模型认识占位符并主动调工具（视觉模型看不到占位符，提示无害）。
  ctx.inject(['agents'], (agentsCtx) => {
    const install = (agent) => {
      agent.ctx.inject(['systemPrompt'], (scope) => {
        scope.systemPrompt.section({
          name: 'dsh-image-relay:placeholder-hint',
          order: 960,
          text: () => PLACEHOLDER_HINT,
        })
      })
    }
    for (const agent of agentsCtx.agents.list()) install(agent)
    agentsCtx.on('agent/created', ({ agent }) => { install(agent) })
  })

  // view_image 工具：把占位符代表的图片转发给视觉模型，返回文字识别结果。
  ctx.tools.register(defineTool({
    name: 'view_image',
    description: 'View one image that appears in this conversation only as a text placeholder '
      + '(text like "[image omitted ... attachment sha256:<digest>]"). Extract the digest from the '
      + 'placeholder, call this tool, and the image is sent to a vision-capable model; its textual '
      + 'description/answer comes back. Use it whenever the user refers to a screenshot, photo, '
      + 'chart, UI, or error dialog and you have not seen the image yourself.',
    parameters: {
      attachment_id: {
        type: 'string',
        required: true,
        description: 'The attachment id from the placeholder — the full "sha256:..." value or just the digest prefix.',
      },
      question: {
        type: 'string',
        required: false,
        description: 'What to examine in the image, e.g. "transcribe all text" or "describe the error dialog". Defaults to a full description.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          attachment_id: { type: 'string' },
          question: { type: 'string' },
          answer: { type: 'string' },
          truncated: { type: 'boolean' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Image recognition result (${value.attachment_id}): ${value.answer}`,
      }],
    },
    async execute(args, exec) {
      const question = (args.question ?? 'Describe this image in detail, including any visible text verbatim.').trim()
      if (!exec.agent) throw new Error('view_image requires an owning agent session')
      const refs = findAttachmentRefs(exec.agent.session, args.attachment_id.trim())
      if (refs.length === 0) {
        throw new Error(`view_image: no image in this conversation matches attachment "${args.attachment_id}"; copy the digest from the placeholder text`)
      }
      if (refs.length > 1) {
        throw new Error(`view_image: attachment "${args.attachment_id}" is ambiguous (${refs.length} images match); use a longer digest prefix`)
      }
      const answer = await runVisionModel(ctx, await route(), refs[0], question, exec.signal)
      const truncated = answer.length > maxAnswerChars
      return {
        attachment_id: String(refs[0].attachmentId),
        question,
        answer: truncated ? `${answer.slice(0, maxAnswerChars)}\n[truncated]` : answer,
        truncated,
      }
    },
    presentCall: args => ({ card: 'generic', title: 'View image via vision model', kind: 'other', rawInput: args }),
  }))
}
