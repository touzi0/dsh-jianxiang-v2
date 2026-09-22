// 断言 Office 组合位注册的技能与资源基目录，含新增的 pdf 技能。
// 装配方式与 apps/desktop-host/tests/office.spec.ts 相同，但用真实载荷资源。
//
// 包名经 profile 的解析池解析（createRequire 指向 profile 的 cordis.yml），
// 与运行期 cordis.yml 的解析域一致；从 tools/ 直接 import 会解析不到。
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = resolve(import.meta.dirname, '..', '..')
const PROFILE = join(REPO, 'dsh-home', 'profiles', 'web')
const ASSETS = join(REPO, 'dsh-home', 'office-runtime', 'office-skills')
const require = createRequire(join(PROFILE, 'cordis.yml'))

/** 从 profile 解析池加载一个包。 */
async function fromPool(specifier) {
  return await import(pathToFileURL(require.resolve(specifier)).href)
}

const { Context } = await fromPool('@deepseek-ai/cordis')
const { default: SkillRegistry } = await fromPool('@deepseek-ai/dsh-skill')
const officeSkills = await fromPool('@deepseek-ai/dsh-skill-office')

const ctx = new Context()
let failed = false
try {
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(officeSkills, { assetRoot: ASSETS })
  const skills = (await ctx.skills.list()).map((skill) => skill.name)
  console.log(`技能目录：${JSON.stringify(skills)}`)
  // 注册表按名称字母序返回，不是提供方的注册顺序。
  const expected = ['ocr', 'office-docx', 'office-pptx', 'office-xlsx', 'pdf']
  if (JSON.stringify(skills) !== JSON.stringify(expected)) {
    failed = true
    console.log(`❌ 与预期不符，应为 ${JSON.stringify(expected)}`)
  }
  for (const name of expected.slice().sort()) {
    const skill = await ctx.skills.get(name)
    console.log(`  ${name.padEnd(14)} resourceBase=${JSON.stringify(skill?.resourceBase)}`)
  }
  for (const name of ['pdf', 'ocr']) {
    const skill = await ctx.skills.get(name)
    if (skill?.resourceBase?.kind !== 'directory') {
      failed = true
      console.log(`❌ ${name} 技能没有目录资源基`)
    }
  }
  if (!failed) console.log('\n✅ 五个技能全部注册，pdf / ocr 资源基正确')
} catch (error) {
  failed = true
  console.log(`❌ 装配失败：${error.message}`)
} finally {
  await ctx.fiber.dispose()
}
process.exitCode = failed ? 1 : 0
