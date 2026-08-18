/**
 * adhdgofly-dsh-ext — client half.
 *
 * Bundled to lib/client.js (window.__ModuleLoader__.load format, see build.mjs)
 * and activated by the browser Cordis Loader as `apply(ctx, config)`.
 *
 * Config source (v0.1.3): the `adhdgofly` settings namespace served through
 * `ctx.settingsScope`. The highlighter is initialised from the localStorage
 * fallback cache / baked defaults and then reactively re-fed from the scope
 * once it reaches `ready` (loopback host-persisted config). On remote browsers
 * the scope stays `unavailable` and the localStorage cache remains authoritative.
 */

import {
  ADHDGoFlyHighlighter,
  fallbackIsDark,
  fallbackSubscribe,
  type ThemeBridge,
} from './highlighter'
import {
  loadPersistedConfig,
  normalizeConfig,
  savePersistedConfig,
} from './config'
import { setHighlighter, updateHighlighterConfig } from './state'
import { registerSettings, NS } from './settings'

/** Services this plugin depends on via dsh.client.inject. */
export const inject: string[] = []

interface ThemeLike {
  getTheme(): { active?: { colorScheme?: string } }
}

function makeThemeBridge(ctx: any): ThemeBridge {
  const theme = ctx.get('theme') as ThemeLike | undefined
  if (theme && typeof theme.getTheme === 'function') {
    return {
      isDark: () => {
        try {
          return theme.getTheme()?.active?.colorScheme === 'dark'
        } catch {
          return fallbackIsDark()
        }
      },
      // 'theme/change' is emitted by @deepseek-ai/dsh-client-ui-theme;
      // ctx.on is fiber-owned, so the disposer is a no-op.
      subscribe: (cb) => {
        ctx.on('theme/change', cb)
        return () => {}
      },
    }
  }
  return { isDark: fallbackIsDark, subscribe: fallbackSubscribe }
}

export function apply(ctx: any, _config: unknown): void {
  ctx.effect(() => {
    // Initial config from the fallback cache / defaults; the scope bridge below
    // overrides it with the served namespace value once ready.
    const initial = loadPersistedConfig()
    const hl = new ADHDGoFlyHighlighter(makeThemeBridge(ctx), initial)
    setHighlighter(hl)

    // Reactive bridge: push the served `adhdgofly` namespace into the highlighter
    // whenever it changes (loopback host-persisted config), and write through to
    // the localStorage cache so remote browsers see the latest known value.
    const binder = ctx.get('settingsScope')
    const scope = binder?.bind?.({ namespace: NS })
    let unsub: (() => void) | undefined
    if (scope) {
      const push = () => {
        const snap = scope.getSnapshot()
        if (snap.status === 'ready' && snap.value) {
          const cfg = normalizeConfig(snap.value)
          savePersistedConfig(cfg)
          updateHighlighterConfig(cfg)
        }
      }
      unsub = scope.subscribe(push)
      push()
    }

    registerSettings(ctx)

    return () => {
      unsub?.()
      setHighlighter(null)
      hl.dispose()
    }
  }, 'adhdgofly: highlighter + settings')
}

/** Runtime config update entry (settings UI / future host RPC). */
export function updateConfig(config: unknown): void {
  updateHighlighterConfig(config)
}
