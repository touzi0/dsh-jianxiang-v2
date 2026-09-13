/**
 * 坚祥模组扫描与补丁层生成（宿主侧纯 Node 逻辑）。
 *
 * 约定：插件\ 下每个子文件夹是一个模组包（package.json 必须存在）。
 * 可选 jx 清单字段（写在模组 package.json 的 "jx" 键下）：
 *   - description: string        展示用描述
 *   - replaces: string[]         启用时要禁用的原生插件行 id
 *   - defaultEnabled: boolean    未曾在设置页开关过时的默认状态（默认 true）
 * 开关状态持久化在 插件\.jx-mods.json；补丁层写入 插件\.jx-mods.patch.yml。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { JxModRow, JxOverride } from './types.ts'

/** 运行时的本包目录（构建后为 lib/，与 src/ 同深度，两可）。 */
const SELF_DIR = dirname(fileURLToPath(import.meta.url))
/** 插件\ 根：环境变量优先，其次按包位置推导（lib/ 与 src/ 同深度）。 */
export const MODS_ROOT = process.env.JX_MODS_ROOT?.trim() || resolve(SELF_DIR, '../..')
export const STATE_FILE = join(MODS_ROOT, '.jx-mods.json')
export const PATCH_FILE = join(MODS_ROOT, '.jx-mods.patch.yml')

/** 管理器自身的目录名（不出现在模组列表里）。 */
const SELF_PACKAGE = 'dsh-mod-manager'

interface ModManifest {
  name?: unknown
  version?: unknown
  main?: unknown
  exports?: unknown
  dsh?: { client?: unknown }
  jx?: { description?: unknown, replaces?: unknown, overrides?: unknown, defaultEnabled?: unknown, config?: unknown }
}

/** 读取开关状态文件（损坏或缺失时视为空）。 */
function readState(): Record<string, boolean> {
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, boolean>
  } catch { /* 文件不存在或损坏：全部走默认值 */ }
  return {}
}

function writeState(state: Record<string, boolean>): void {
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

/** 解析 DSH home（与官方 resolveDshHome 同规则：$DSH_HOME 优先，缺省 ~/.dsh）。 */
function resolveDshHome(): string {
  const fromEnv = process.env.DSH_HOME
  const selected = fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : join(homedir(), '.dsh')
  return resolve(selected.replace(/^~(?![^/\\])/, homedir()))
}

/** 解析 config 里的 $dshHomePath 路径标记为绝对路径（其余值原样保留）。 */
function resolveConfigValues(config: Record<string, unknown>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(config)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)
      && typeof (value as Record<string, unknown>).$dshHomePath === 'string') {
      resolved[key] = join(resolveDshHome(), (value as Record<string, unknown>).$dshHomePath as string)
    } else {
      resolved[key] = value
    }
  }
  return resolved
}

/** 校验并解析 manifest 的 jx.overrides 声明（非法项跳过并告警）。 */
function parseOverrides(modName: string, value: unknown): JxOverride[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    console.warn(`[jx-mod-manager] ${modName} 的 jx.overrides 必须是数组，已忽略`)
    return []
  }
  const overrides: JxOverride[] = []
  for (const item of value) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)
      || typeof (item as Record<string, unknown>).id !== 'string') {
      console.warn(`[jx-mod-manager] ${modName} 的 jx.overrides 存在非法项（需 { id, config?/disabled? }），已跳过`)
      continue
    }
    const record = item as Record<string, unknown>
    const hasConfig = record.config !== null && typeof record.config === 'object' && !Array.isArray(record.config)
    const hasDisabled = record.disabled === true || record.disabled === false
    if (!hasConfig && !hasDisabled) {
      console.warn(`[jx-mod-manager] ${modName} 的 jx.overrides 项 ${String(record.id)} 缺少 config 或 disabled，已跳过`)
      continue
    }
    overrides.push({
      id: record.id as string,
      ...(hasConfig ? { config: record.config as Record<string, unknown> } : {}),
      ...(hasDisabled ? { disabled: record.disabled as boolean } : {}),
    })
  }
  return overrides
}

/** 从模组 package.json 解析宿主入口（exports["."] 优先，其次 main，最后 index.js）。 */
function resolveEntry(manifest: ModManifest): string | undefined {
  const dot = manifest.exports !== null && typeof manifest.exports === 'object' && !Array.isArray(manifest.exports)
    ? (manifest.exports as Record<string, unknown>)['.']
    : undefined
  const candidates = [
    typeof manifest.exports === 'string' ? manifest.exports : undefined,
    typeof dot === 'string' ? dot : undefined,
    dot !== null && typeof dot === 'object'
      ? [((dot as Record<string, unknown>).default), ((dot as Record<string, unknown>).import), ((dot as Record<string, unknown>).node)]
          .find(value => typeof value === 'string')
      : undefined,
    typeof manifest.main === 'string' ? manifest.main : undefined,
    'index.js',
  ]
  const entry = candidates.find(value => typeof value === 'string') as string | undefined
  if (entry === undefined) return undefined
  return entry.replace(/^\.\//, '').replace(/^\/+/, '')
}

/** 扫描 插件\ 生成模组行（含开关状态合并）。 */
export function listMods(): JxModRow[] {
  const state = readState()
  const rows: JxModRow[] = []
  if (!existsSync(MODS_ROOT)) return rows
  for (const dirName of readdirSync(MODS_ROOT).sort()) {
    if (dirName.startsWith('.') || dirName === 'node_modules') continue
    const modDir = join(MODS_ROOT, dirName)
    if (!statSync(modDir).isDirectory()) continue
    const pkgPath = join(modDir, 'package.json')
    if (!existsSync(pkgPath)) continue
    let manifest: ModManifest
    try {
      manifest = JSON.parse(readFileSync(pkgPath, 'utf8')) as ModManifest
    } catch (error) {
      rows.push({
        id: dirName, name: dirName, version: '', description: `package.json 解析失败：${String(error)}`,
        entry: '', hasClient: false, replaces: [], overrides: [], enabled: false,
      })
      continue
    }
    if (dirName === SELF_PACKAGE) continue
    const jx = manifest.jx ?? {}
    const replaces = Array.isArray(jx.replaces) ? jx.replaces.filter(id => typeof id === 'string') : []
    const overrides = parseOverrides(dirName, jx.overrides)
    const defaultEnabled = jx.defaultEnabled === false ? false : true
    const entry = resolveEntry(manifest)
    const ownConfig = jx.config !== null && typeof jx.config === 'object' && !Array.isArray(jx.config)
      ? jx.config as Record<string, unknown>
      : undefined
    rows.push({
      id: dirName,
      name: typeof manifest.name === 'string' ? manifest.name : dirName,
      version: typeof manifest.version === 'string' ? manifest.version : '',
      description: typeof jx.description === 'string' ? jx.description
        : typeof manifest.description === 'string' ? manifest.description : '',
      entry: entry ?? '',
      hasClient: manifest.dsh?.client !== undefined,
      replaces: replaces as string[],
      overrides,
      ...(ownConfig === undefined ? {} : { config: ownConfig }),
      enabled: entry !== undefined && (dirName in state ? state[dirName] === true : defaultEnabled),
    })
  }
  return rows
}

/**
 * 生成补丁层内容（JSON 数组——合法 YAML 流式写法，避开引号转义问题）。
 * 行序：所有 replaces 的 disable 行 → overrides 的 config 覆盖行 → insert 行；
 * insert 的 name 是相对补丁文件的入口路径（加载器会把 ./ 路径锚定到补丁文件旁）。
 */
function renderPatch(rows: readonly JxModRow[]): string {
  const patches: Array<Record<string, unknown>> = []
  const inserts: Array<Record<string, unknown>> = []
  const disabledIds = new Set<string>()
  for (const row of rows) {
    if (!row.enabled || row.entry === '') continue
    if (!existsSync(join(MODS_ROOT, row.id, row.entry))) {
      // 未构建的模组：跳过挂载并告警，不能让整个启动失败（管理页仍会列出它）。
      console.warn(`[jx-mod-manager] ${row.id} 的入口 ${row.entry} 不存在（未构建？），本次启动跳过挂载`)
      continue
    }
    for (const nativeId of row.replaces) {
      // 多个模组可能替换同一原生行：去重，只发一条 disable。
      if (disabledIds.has(nativeId)) continue
      disabledIds.add(nativeId)
      patches.push({ id: nativeId, disabled: true })
    }
    for (const override of row.overrides) {
      patches.push({
        id: override.id,
        ...(override.disabled === undefined ? {} : { disabled: override.disabled }),
        ...(override.config === undefined ? {} : { config: resolveConfigValues(override.config) }),
      })
    }
    inserts.push({
      id: row.id,
      name: `./${row.id}/${row.entry}`,
      ...(row.config === undefined ? {} : { config: resolveConfigValues(row.config) }),
    })
  }
  if (inserts.length > 0) patches.push({ insert: inserts })
  return `${JSON.stringify(patches, null, 2)}\n`
}

/** 按当前状态重写补丁层文件。 */
export function regeneratePatch(rows: readonly JxModRow[]): void {
  mkdirSync(MODS_ROOT, { recursive: true })
  writeFileSync(PATCH_FILE, renderPatch(rows), 'utf8')
}

/** 翻转一个模组的开关并重新生成补丁层。找不到模组时抛错。 */
export function setModEnabled(id: string, enabled: boolean): void {
  const rows = listMods()
  const row = rows.find(candidate => candidate.id === id)
  if (row === undefined) throw new Error(`jx-mod-manager: unknown mod ${JSON.stringify(id)}`)
  const state = readState()
  state[id] = enabled
  writeState(state)
  row.enabled = enabled
  regeneratePatch(rows)
}
