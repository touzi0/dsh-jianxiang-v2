/**
 * dsh-permission-split 构建入口：依次打包宿主半边与客户端半边。
 *
 * 显式指定本目录的两份配置，避免 tsdown 向上发现仓库根 tsdown.config.ts。
 */
import { build } from 'tsdown'

await build({ config: 'tsdown.host.ts' })
await build({ config: 'tsdown.client.ts' })
