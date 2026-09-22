// 端到端验证：用官方 desktop-host 模块消费本目录构建的载荷。
// 覆盖 readPrimaryRuntime → installPrimaryRuntime → workspaceDependencyPaths。
import { pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const primaryRuntime = join(REPO, 'apps', 'desktop-host', 'lib', 'types', 'primary-runtime.js')

const { readPrimaryRuntime, installPrimaryRuntime, workspaceDependencyPaths } = await import(pathToFileURL(primaryRuntime).href)

const source = join(REPO, 'dsh-home', 'office-runtime', 'primary-runtime')
const root = join(REPO, 'dsh-home', 'office-runtime', 'installed', 'primary-runtime')

const manifest = await readPrimaryRuntime(source)
console.log('[1] readPrimaryRuntime 通过')
console.log('    platform/arch =', manifest.platform, manifest.arch)
console.log('    components    =', JSON.stringify(manifest.components))
console.log('    digest        =', `${manifest.payloadDigest.slice(0, 16)}...`)

const paths = await installPrimaryRuntime(source, root)
console.log('[2] installPrimaryRuntime 通过，安装到：')
console.log('   ', root)
for (const [key, value] of Object.entries(paths)) {
  if (key === 'pythonDistributions') continue
  console.log(`    ${key.padEnd(15)} ${value}`)
}

const derived = workspaceDependencyPaths(root, manifest)
console.log('[3] workspaceDependencyPaths 与安装结果一致 =', JSON.stringify(derived) === JSON.stringify(paths))

const again = await installPrimaryRuntime(source, root)
console.log('[4] 重复安装幂等 =', JSON.stringify(again) === JSON.stringify(paths))
console.log('[5] 记录的 Python 发行版数量 =', Object.keys(again.pythonDistributions).length)
