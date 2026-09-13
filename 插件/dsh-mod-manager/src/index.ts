/**
 * 坚祥模组管理器 —— 宿主半边。
 * 以 Typert Remote 服务 `jxMods` 暴露模组列表与开关（参照官方 plugin-inventory）：
 * 类默认导出由 Cordis 以 new(ctx, config) 实例化，构造器注册服务与 typertRemote 绑定；
 * 网关通过 SRC 标记自动发现端点并解析参数名，无需生成工件。
 * 注：不用 @Remote 装饰器语法（外部包的构建管线不转换装饰器），
 * 改为按 typert-protocol 的原型描述符协议直接标注——与装饰器运行时效果等价。
 */
import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { listMods, regeneratePatch, setModEnabled, MODS_ROOT, PATCH_FILE } from './mods.ts'
import type { JxModRow, JxModsSnapshot } from './types.ts'

export type { JxModRow, JxModsSnapshot }
export { MODS_ROOT, PATCH_FILE }

export class JxModsGateway extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'jxMods')
    void ctx
    // 启动时按当前开关状态落一次补丁层，保证手工改 .jx-mods.json 后也能对齐。
    regeneratePatch(listMods())
  }

  /** 当前模组清单（含开关状态）。 */
  async list(): Promise<JxModsSnapshot> {
    return { modsRoot: MODS_ROOT, patchFile: PATCH_FILE, mods: listMods() }
  }

  /** 翻转一个模组的开关，重新生成补丁层；重启后生效。 */
  async setEnabled(id: string, enabled: boolean): Promise<{ restartNeeded: true }> {
    setModEnabled(id, enabled)
    return { restartNeeded: true }
  }

  /** 重新扫描 插件\ 目录并按状态重写补丁层（新增模组文件夹后调用）。 */
  async rescan(): Promise<JxModsSnapshot> {
    const mods = listMods()
    regeneratePatch(mods)
    return { modsRoot: MODS_ROOT, patchFile: PATCH_FILE, mods }
  }
}

// typert-protocol 的远程方法标记（等价于每个方法上的 @Remote('...')）。
// 键与结构见 packages/typert/protocol/src/index.ts 的 mark()/readRemoteMethodDescriptor()。
const REMOTE_METHODS_KEY = '@deepseek-ai/dsh-typert-protocol/remote-methods'
const directMarker = (method: string) => Object.freeze({
  method,
  invocation: Object.freeze({ kind: 'direct' }),
})
Object.defineProperty(JxModsGateway.prototype, REMOTE_METHODS_KEY, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([directMarker('list'), directMarker('setEnabled'), directMarker('rescan')]),
  }),
})

export default JxModsGateway
