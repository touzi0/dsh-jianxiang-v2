#!/usr/bin/env node
/**
 * 构建 Office 能力的可重定位运行时载荷（源码检出侧）。
 *
 * 官方桌面端在打包阶段由 apps/desktop/scripts/prepare-primary-runtime.ts 生成载荷；
 * 本脚本让"从源码拉取"的检出也能得到同一份东西：便携 Python、Node、pnpm，
 * 以及 python-docx / python-pptx / openpyxl / pandas / numpy / Pillow / lxml /
 * XlsxWriter 等锁定版本的 wheel。版本与 SHA-256 全部取自
 * apps/desktop/scripts/primary-runtime-lock.json，不另行放宽。
 *
 * 产出布局（与桌面端一致，故 desktop-host 的 installPrimaryRuntime 可直接消费）：
 *   <root>/primary-runtime/runtime.json
 *   <root>/primary-runtime/dependencies/{python,node,pnpm}
 *   <root>/office-skills/            ← office-docx/pptx/xlsx 与 scripts/check_office.py
 *
 * 用法：
 *   node tools/office-runtime/build-office-runtime.mjs --root <dir> [--cache <dir>]
 *                                                     [--target win-x64] [--force]
 */
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const LOCK_PATH = join(REPO, 'apps', 'desktop', 'scripts', 'primary-runtime-lock.json')
const OFFICE_PACKAGE = '@deepseek-ai/dsh-skill-office'

/** 便携解释器与 wheel 的锁定清单；与桌面端打包共用同一份事实源。 */
export const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8'))

/** 当前主机对应的官方构建目标标识。 */
export function hostTarget() {
  if (process.platform === 'win32' && process.arch === 'x64') return 'win-x64'
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'mac-arm64'
  if (process.platform === 'darwin' && process.arch === 'x64') return 'mac-x64'
  throw new Error(`office runtime: unsupported host ${process.platform}/${process.arch}`)
}

/**
 * 下载并按 SHA-256 校验一个归档；命中缓存时不重复下载。
 * @param {string} url - 锁定归档地址。
 * @param {string} sha256 - 期望的 SHA-256 摘要。
 * @param {string} cache - 下载缓存目录。
 * @returns {Promise<string>} 已校验的本地归档路径。
 */
export async function fetchVerified(url, sha256, cache) {
  await mkdir(cache, { recursive: true })
  const destination = join(cache, sha256)
  if (existsSync(destination)) return destination
  const response = await fetch(url)
  if (!response.ok) throw new Error(`office runtime download: ${String(response.status)} ${url}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== sha256) throw new Error(`office runtime download: checksum mismatch for ${url}`)
  await writeFile(destination, bytes)
  return destination
}

/** 便携 Python 归档名，与桌面端打包脚本逐字一致。 */
export function pythonArchiveName(target) {
  return `cpython-${lock.pythonVersion}+${lock.pythonRelease}-${lock.targets[target].pythonTarget}-install_only_stripped.tar.gz`
}

/** 便携 Python 归档的下载地址。 */
export function pythonArchiveUrl(target) {
  return `https://github.com/astral-sh/python-build-standalone/releases/download/${lock.pythonRelease}/${encodeURIComponent(pythonArchiveName(target))}`
}

/** Node 归档名。 */
export function nodeArchiveName(target) {
  return `node-v${lock.nodeVersion}-${lock.targets[target].nodeArchive}`
}

/** Node 归档的下载地址。 */
export function nodeArchiveUrl(target) {
  return `https://nodejs.org/dist/v${lock.nodeVersion}/${nodeArchiveName(target)}`
}

/**
 * 载荷身份摘要，与桌面端 primaryRuntimePayloadDigest 同构；
 * 输入未变则 installPrimaryRuntime 会复用已安装树而不重复拷贝。
 * @param {string} target - 构建目标标识。
 * @param {string} pnpmVersion - 打入载荷的 pnpm 版本。
 * @returns {string} SHA-256 摘要。
 */
export function payloadDigest(target, pnpmVersion) {
  const { pythonVersion, pythonRelease, nodeVersion, wheels, pythonPackages } = lock
  return createHash('sha256').update(JSON.stringify({
    format: 2, target, pythonVersion, pythonRelease, nodeVersion,
    artifact: lock.targets[target], wheels, pythonPackages, pnpm: pnpmVersion,
  })).digest('hex')
}

// pnpm 的严格布局把 tar / extract-zip / pnpm 放在 apps/desktop 的解析域内，
// 从本目录直接 import 会 UNRESOLVED，故统一经由该解析域取包。
const desktopRequire = createRequire(join(REPO, 'apps', 'desktop', 'package.json'))

/** 定位一个 workspace 依赖的 package.json，避免依赖根目录提升布局。 */
function resolvePackageManifest(name) {
  return desktopRequire.resolve(`${name}/package.json`)
}

/** pnpm 未导出 ./package.json，按其入口反查所在包目录。 */
function resolvePackageDirectory(name) {
  let directory = dirname(desktopRequire.resolve(name))
  while (directory !== dirname(directory)) {
    const manifest = join(directory, 'package.json')
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === name) return directory
    directory = dirname(directory)
  }
  throw new Error(`office runtime: cannot locate package directory for ${name}`)
}

/** 按目标平台给出依赖路径，与 desktop-host 的 workspaceDependencyPaths 结果一致。 */
export function dependencyPaths(root, target) {
  const dependencies = join(root, 'dependencies')
  const windows = target === 'win-x64'
  const short = lock.pythonVersion.split('.').slice(0, 2).join('.')
  return {
    dependencies,
    python: join(dependencies, 'python', ...(windows ? ['python.exe'] : ['bin', 'python3'])),
    node: join(dependencies, 'node', 'bin', windows ? 'node.exe' : 'node'),
    pnpm: join(dependencies, 'pnpm', 'bin', 'pnpm.mjs'),
    pythonPackages: join(dependencies, 'python', ...(windows ? ['Lib'] : ['lib', `python${short}`]), 'site-packages'),
    nodePackages: join(dependencies, 'node', 'node_modules'),
  }
}

/** 校验依赖树中的每个入口都存在，缺失即失败。 */
async function assertPayload(paths) {
  for (const [label, path] of Object.entries(paths)) {
    if (label === 'dependencies') continue
    await stat(path)
  }
}

/**
 * 装配一个目标平台的完整载荷。
 * @param {object} options - 装配选项。
 * @param {string} options.root - 产出根目录，载荷写入其 primary-runtime 子目录。
 * @param {string} [options.cache] - 归档缓存目录，默认 <root>/.cache。
 * @param {string} [options.target] - 构建目标，默认当前主机。
 * @returns {Promise<{runtime: string, officeSkills: string, python: string, node: string, pnpm: string, pythonPackages: string}>}
 */
export async function buildOfficeRuntime(options) {
  const root = resolve(options.root)
  const target = options.target ?? hostTarget()
  if (!(target in lock.targets)) throw new Error(`office runtime: unknown target ${target}`)
  const cache = resolve(options.cache ?? join(root, '.cache'))
  const artifact = lock.targets[target]
  const runtime = join(root, 'primary-runtime')
  const officeSkills = join(root, 'office-skills')

  // 动态 import 只接受 file: URL；Windows 绝对路径必须先转换。
  const { x: extractTar } = await import(pathToFileURL(desktopRequire.resolve('tar')).href)
  const { default: extractZip } = await import(pathToFileURL(desktopRequire.resolve('extract-zip')).href)

  const staging = await mkdtemp(join(tmpdir(), 'jx-office-runtime-'))
  try {
    const output = join(staging, 'payload')
    const paths = dependencyPaths(output, target)
    await mkdir(paths.dependencies, { recursive: true })

    console.log('[1/6] 便携 Python', lock.pythonVersion)
    const pythonArchive = await fetchVerified(pythonArchiveUrl(target), artifact.pythonSha256, cache)
    await extractTar({ file: pythonArchive, cwd: paths.dependencies })

    console.log('[2/6] Node', lock.nodeVersion)
    const nodeArchive = await fetchVerified(nodeArchiveUrl(target), artifact.nodeSha256, cache)
    const unpackedNode = join(staging, 'node')
    await mkdir(unpackedNode, { recursive: true })
    if (target === 'win-x64') await extractZip(nodeArchive, { dir: unpackedNode })
    else await extractTar({ file: nodeArchive, cwd: unpackedNode })
    const nodeSource = join(unpackedNode, nodeArchiveName(target).replace(/\.(?:zip|tar\.gz)$/u, ''))
    await mkdir(join(paths.node, '..'), { recursive: true })
    await mkdir(paths.nodePackages, { recursive: true })
    await writeFile(join(paths.nodePackages, 'README.txt'),
      'Reserved for bundled Node packages. pnpm uses its default installation directories.\n')
    await cp(join(nodeSource, ...(target === 'win-x64' ? ['node.exe'] : ['bin', 'node'])), paths.node)
    await cp(join(nodeSource, 'LICENSE'), join(paths.dependencies, 'node', 'LICENSE'))

    console.log('[3/6] pnpm')
    const pnpmDirectory = resolvePackageDirectory('pnpm')
    const pnpm = JSON.parse(readFileSync(join(pnpmDirectory, 'package.json'), 'utf8'))
    await cp(pnpmDirectory, join(paths.dependencies, 'pnpm'), { recursive: true, dereference: true })

    console.log('[4/6] Office 与数据 wheel')
    for (const wheel of [...artifact.wheels, ...lock.wheels]) {
      const archive = await fetchVerified(wheel.url, wheel.sha256, cache)
      await extractZip(archive, { dir: paths.pythonPackages })
    }

    const desktop = JSON.parse(readFileSync(join(REPO, 'apps', 'desktop', 'package.json'), 'utf8'))
    const manifest = {
      desktopVersion: desktop.version,
      platform: target === 'win-x64' ? 'win32' : 'darwin',
      arch: target === 'mac-arm64' ? 'arm64' : 'x64',
      payloadDigest: payloadDigest(target, pnpm.version),
      pythonPackages: lock.pythonPackages,
      components: {
        python: lock.pythonVersion,
        node: lock.nodeVersion,
        pnpm: pnpm.version,
        numpy: lock.pythonPackages.numpy,
        pandas: lock.pythonPackages.pandas,
      },
    }
    const entries = dependencyPaths(output, target)
    await assertPayload(entries)
    await writeFile(join(output, 'runtime.json'), `${JSON.stringify(manifest, undefined, 2)}\n`)

    console.log('[5/6] Office skill 资源')
    const officeManifest = resolvePackageManifest(OFFICE_PACKAGE)
    await rm(officeSkills, { recursive: true, force: true })
    await mkdir(dirname(officeSkills), { recursive: true })
    await cp(join(dirname(officeManifest), 'assets'), officeSkills, { recursive: true, dereference: true })

    console.log('[6/6] 安装载荷')
    await rm(runtime, { recursive: true, force: true })
    await cp(output, runtime, { recursive: true, dereference: true })
    return { runtime, officeSkills, ...dependencyPaths(runtime, target) }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    root: { type: 'string' },
    cache: { type: 'string' },
    target: { type: 'string' },
  } })
  if (!values.root) throw new Error('office runtime: --root is required')
  const built = await buildOfficeRuntime({ root: values.root, cache: values.cache, target: values.target })
  console.log('[完成] 载荷就绪：')
  console.log(JSON.stringify(built, undefined, 2))
}

if (import.meta.main) await main()
