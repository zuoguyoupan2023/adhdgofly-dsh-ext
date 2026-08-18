/**
 * adhdgofly-dsh-ext — host half.
 *
 * All highlighting runs client-side against the embedded compact dictionaries;
 * the host's only job here is to own the `adhdgofly` settings namespace (rc.7
 * plugin-settings mechanism). The composition-layer `base` comes from the row
 * config in cordis.patch.yml; the user layer is persisted by the DSH settings
 * provider. The browser half (dsh.client) binds this same namespace through
 * `ctx.settingsScope` and renders the configurable card.
 *
 * Two settings surfaces coexist (dual-mode):
 *   - settings.section  — classic left-side section (browser half)
 *   - settings.plugin.item — rc.7 plugin card (browser half)
 * both bind the same namespace below, so they stay in sync.
 */

import z from '@deepseek-ai/schemastery'
import { settingsNamespace, installSettingsSection, type SettingsNamespace } from '@deepseek-ai/dsh-settings'

/** Settings namespace for this plugin's configuration. */
export const NS: SettingsNamespace = settingsNamespace('adhdgofly')

/** Schema resolving the namespace — mirrors the fields in src/client/config.ts. */
export const SCHEMA = z.object({
  enabled: z.boolean().default(true),
  languages: z.array(z.union(['en', 'zh'] as const)).default(['en', 'zh']),
  minWordLength: z.number().min(1).max(10).default(2),
  decorationStyle: z.union(['color', 'highlight'] as const).default('color'),
  posFilter: z.array(z.union(['n', 'v', 'a', 'o'] as const)).default(['n', 'v', 'a', 'o']),
  containers: z.array(z.string()).default(['[data-conversation-scroll]']),
  highlightInComments: z.boolean().default(false),
})

export function apply(ctx: unknown, entry?: unknown): void {
  installSettingsSection(ctx as never, NS, SCHEMA, (entry ?? {}) as never, {
    // v1 has no host-side runtime to re-configure; the browser half reads the
    // namespace directly through ctx.settingsScope, so these are no-ops.
    setSource: () => {},
    onChange: () => {},
  })
}
