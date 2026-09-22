// @vitest-environment jsdom
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { TestRemote, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject, NS, SECTION_ID } from '../src/client/index.ts'
import { PluginManagerPage } from '../src/client/PluginManagerPage.tsx'
import type { PluginManagerFace } from '../src/client/manager-store.ts'
import { apply as hostApply } from '../src/index.ts'

usePinnedBrowserLanguages('zh-CN')

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  class LocaleHolder extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'localeHolder')
    }
  }
  new LocaleHolder(ctx)
  const list = vi.fn(() => Promise.resolve({ ok: true as const, value: { entries: [], managementAvailable: true } }))
  const remote = new TestRemote(ctx, {
    pluginInventory: { list },
    pluginManager: {
      listBundles: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
      listPlugins: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
    },
  })
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, list, remote }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'settings.section': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
}

describe('ui-plugin-manager browser plugin', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares only the services the page and its Remote methods use', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.pluginManager', 'remote.pluginInventory'])
  })

  it('registers the Settings section and its page, which reads the Host only once rendered and follows Host changes', async () => {
    const b = await bench()
    declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    const entry = b.slots.entries('settings.section')[0]!
    expect(entry.component).toBe(PluginManagerPage)
    // The section sits beside the built-in components section (order 15) and speaks the dictionary.
    expect(entry.options).toMatchObject({ id: SECTION_ID, order: 17 })
    expect(entry.locale).toBe(NS)
    expect(resolveSlotLabel(entry.options.label)).toBe('插件管理')
    // The page declares the slots a plugin's configuration arrives through, and binds their projection beside its state.
    expect(b.slots.spec('plugins.item')).toMatchObject({ kind: 'list', scope: 'root' })
    expect(b.slots.spec('plugins.bundle.config')).toMatchObject({ kind: 'keyed', scope: 'root' })
    expect(b.slots.spec('plugins.row.config')).toMatchObject({ kind: 'keyed', scope: 'root' })
    const face = (entry.inject as unknown as () => PluginManagerFace)()
    expect(face.hooks.configLedger.getSnapshot()).toEqual({ items: [], bundles: new Set(), rows: new Set() })
    // A Host change before the first render is not a reason to read.
    b.remote.emit('plugin-manager/changed', [{ reason: 'install' }])
    b.ctx.emit('connection/reset')
    await Promise.resolve()
    expect(b.list).not.toHaveBeenCalled()
    face.ensure()
    await vi.waitFor(() => { expect(face.hooks.pluginManager.getSnapshot().status).toBe('ready') })
    expect(b.list).toHaveBeenCalledTimes(1)
    b.remote.emit('plugin-manager/changed', [{ reason: 'bundle' }])
    await vi.waitFor(() => { expect(b.list).toHaveBeenCalledTimes(2) })
    b.ctx.emit('connection/reset')
    await vi.waitFor(() => { expect(b.list).toHaveBeenCalledTimes(3) })

    // Install output folds into an open run only.
    face.openInstall()
    face.editInstallSpec('pkg')
    b.remote.emit('plugin-manager/install-log', [{ jobId: 'j', argv: ['pnpm', 'add', 'pkg'], cwd: '/p', stream: 'stdout', text: 'early' }])
    b.remote.emit('plugin-manager/install-state', [{ requestId: 'foreign', phase: 'installing' }])
    expect(face.hooks.pluginManager.getSnapshot().install.runs).toEqual([])

    await fiber.dispose()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    b.remote.emit('plugin-manager/changed', [{ reason: 'install' }])
    await Promise.resolve()
    expect(b.list).toHaveBeenCalledTimes(3)
  })
})
