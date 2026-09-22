/** 数字助理的界面文案（客户端半边）。 */

/** 词典命名空间。 */
export const NS = 'dshDigitalAssistant'

/** 中文文案。 */
export const zh = {
  'panel': '数字助理主对话',
  'opening': '正在打开数字助理主对话…',
  'openFailed': '打不开数字助理主对话',
  'retry': '再点一次侧边栏的「数字助理主对话」重试',
  'hint': '它会把你的需求派给合适的对话去做',
}

/** 英文文案。 */
export const en = {
  'panel': 'Assistant Chat',
  'opening': 'Opening Assistant Chat…',
  'openFailed': 'Could not open Assistant Chat',
  'retry': 'Click “Assistant Chat” in the sidebar to retry',
  'hint': 'It dispatches your request to the right conversation',
}

/** 本插件拥有的文案键。 */
export type DshDigitalAssistantLocaleKey = keyof typeof zh
