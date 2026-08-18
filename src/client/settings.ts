/**
 * Settings surfaces for adhdgofly-dsh-ext (v0.1.3, rc.7 dual-mode).
 *
 * Two coexisting entry points bind the SAME `adhdgofly` settings namespace:
 *   - settings.section       — classic left-side section (kept in place)
 *   - settings.plugin.item   — rc.7 card in Settings → 插件 → 插件配置
 * Editing either writes through the shared scope (host-persisted on loopback),
 * so both surfaces and the highlighter stay in sync. On remote browsers the
 * scope is `unavailable` (settings RPC is loopback-only); the surfaces then
 * fall back to localStorage, preserving the pre-0.1.3 remote-editing behavior.
 *
 * A `uiLayout` preference (both/classic/plugin-card, stored in localStorage and
 * read at apply-time) controls which slots are registered — applied on reload.
 */

import * as React from 'react'
import {
  DEFAULT_CONFIG,
  loadPersistedConfig,
  savePersistedConfig,
  loadLayoutMode,
  saveLayoutMode,
  normalizeConfig,
  type AdhdgoflyConfig,
  type LayoutMode,
  type SettingsScope,
  type SettingsScopeSnapshot,
} from './config'
import { updateHighlighterConfig } from './state'
import { POS_KEYS } from './palette'

export const SECTION_ID = 'adhdgofly'
export const NS = 'adhdgofly'
export const SECTION_LABEL = () => 'ADHDGoFly'

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0', fontSize: 14, lineHeight: 1.6 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontWeight: 500, color: 'var(--dsw-alias-label-primary)' },
  hint: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 },
  checkboxRow: { display: 'flex', gap: 14, flexWrap: 'wrap' },
  checkbox: { display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' },
  input: {
    width: 72,
    padding: '4px 8px',
    borderRadius: 6,
    border: '1px solid var(--dsw-alias-border-l2)',
    background: 'var(--dsw-alias-input-fill, var(--dsw-alias-bg-base))',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: 14,
  },
  select: {
    padding: '4px 8px',
    borderRadius: 6,
    border: '1px solid var(--dsw-alias-border-l2)',
    background: 'var(--dsw-alias-bg-base)',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: 14,
  },
  text: {
    width: '100%',
    padding: '4px 8px',
    borderRadius: 6,
    border: '1px solid var(--dsw-alias-border-l2)',
    background: 'var(--dsw-alias-input-fill, var(--dsw-alias-bg-base))',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: 13,
  },
}

// ── shared reactive config hook ─────────────────────────────────────────────
// Single source: the settings scope when `ready` (loopback); localStorage
// fallback when `loading`/`unavailable` (remote). Writes go through the scope
// when possible; otherwise through the localStorage fallback (which also
// updates the highlighter directly, since the scope bridge won't fire).

function useAdhdgoflyConfig(scope?: SettingsScope<AdhdgoflyConfig>): {
  status: SettingsScopeSnapshot<AdhdgoflyConfig>['status']
  config: AdhdgoflyConfig
  setField: (field: string, value: unknown) => void
  unsetField: (field: string) => void
} {
  const [snap, setSnap] = React.useState<SettingsScopeSnapshot<AdhdgoflyConfig> | undefined>(scope?.getSnapshot())

  React.useEffect(() => {
    if (!scope) return
    const apply = () => setSnap(scope.getSnapshot())
    const dispose = scope.subscribe(apply)
    apply()
    return dispose
  }, [scope])

  const status = snap?.status ?? 'unavailable'
  const config = React.useMemo<AdhdgoflyConfig>(
    () => (status === 'ready' && snap?.value ? normalizeConfig(snap.value) : loadPersistedConfig()),
    [status, snap?.value],
  )

  // Keep the fallback cache + highlighter in sync with the effective config.
  React.useEffect(() => {
    if (status === 'ready') savePersistedConfig(config)
    updateHighlighterConfig(config)
  }, [config, status])

  const setField = (field: string, value: unknown) => {
    if (status === 'ready' && scope) {
      scope.set(field, value)
      return
    }
    // Fallback (remote/unavailable): write localStorage + highlighter directly.
    const next = { ...loadPersistedConfig(), [field]: value }
    savePersistedConfig(next)
    updateHighlighterConfig(next)
  }

  const unsetField = (field: string) => {
    if (status === 'ready' && scope) {
      scope.unset(field)
      return
    }
    setField(field, (DEFAULT_CONFIG as unknown as Record<string, unknown>)[field])
  }

  return { status, config, setField, unsetField }
}

// ── shared controls ─────────────────────────────────────────────────────────

const posColor: Record<string, string> = { n: '#059669', v: '#dc2626', a: '#7c3aed', o: '#6b7280' }
const posText: Record<string, string> = {
  n: '名词 noun', v: '动词 verb', a: '形/副 adj/adv', o: '其他 other',
}

interface ConfigFieldsProps {
  config: AdhdgoflyConfig
  setField: (field: string, value: unknown) => void
  unsetField: (field: string) => void
  onLayoutMode: (mode: LayoutMode) => void
}

function ConfigFields({ config, setField, unsetField, onLayoutMode }: ConfigFieldsProps): React.ReactElement {
  const toggle = (key: 'languages' | 'posFilter', value: string) => {
    const list = (config[key] as string[]) ?? []
    setField(key, list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  const layout = loadLayoutMode()

  return React.createElement(
    'div',
    { style: styles.root },
    // ── layout preference (which settings entry points to show) ──
    React.createElement('div', { style: styles.field },
      React.createElement('label', { style: styles.label, htmlFor: 'adhdgofly-layout' }, '设置入口 / Settings entry'),
      React.createElement('select', {
        id: 'adhdgofly-layout',
        style: styles.select,
        value: layout,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
          const mode = e.target.value as LayoutMode
          saveLayoutMode(mode)
          onLayoutMode(mode)
        },
      },
      React.createElement('option', { value: 'both' }, '左侧分区 + 插件卡片 (both)'),
      React.createElement('option', { value: 'classic' }, '仅左侧分区 (classic)'),
      React.createElement('option', { value: 'plugin-card' }, '仅插件卡片 (plugin-card)'),
      ),
      React.createElement('span', { style: styles.hint }, '改动后刷新页面生效。'),
    ),
    // ── enabled ──
    React.createElement('label', { style: styles.checkbox },
      React.createElement('input', {
        type: 'checkbox',
        checked: config.enabled,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setField('enabled', e.target.checked),
      }),
      '启用词性高亮 / Enable highlighting',
    ),
    // ── languages ──
    React.createElement('div', { style: styles.field },
      React.createElement('span', { style: styles.label }, '语言 / Languages'),
      React.createElement('div', { style: styles.checkboxRow },
        ['en', 'zh'].map((lang) => React.createElement('label', { key: lang, style: styles.checkbox },
          React.createElement('input', {
            type: 'checkbox',
            checked: (config.languages as string[]).includes(lang),
            onChange: () => toggle('languages', lang),
          }),
          lang === 'en' ? 'English' : '中文',
        )),
      ),
    ),
    // ── minWordLength ──
    React.createElement('div', { style: styles.field },
      React.createElement('label', { style: styles.label, htmlFor: 'adhdgofly-minlen' }, '最小词长 / Min word length'),
      React.createElement('input', {
        id: 'adhdgofly-minlen',
        type: 'number',
        min: 1,
        max: 10,
        value: config.minWordLength,
        style: styles.input,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          const n = parseInt(e.target.value, 10)
          if (Number.isFinite(n)) setField('minWordLength', Math.max(1, n))
        },
      }),
    ),
    // ── decorationStyle ──
    React.createElement('div', { style: styles.field },
      React.createElement('label', { style: styles.label, htmlFor: 'adhdgofly-style' }, '高亮样式 / Style'),
      React.createElement('select', {
        id: 'adhdgofly-style',
        value: config.decorationStyle,
        style: styles.select,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
          setField('decorationStyle', e.target.value as AdhdgoflyConfig['decorationStyle']),
      },
      React.createElement('option', { value: 'color' }, '文字变色 / Text color'),
      React.createElement('option', { value: 'highlight' }, '背景框 / Background box'),
      ),
    ),
    // ── posFilter ──
    React.createElement('div', { style: styles.field },
      React.createElement('span', { style: styles.label }, '词性筛选 / POS filter'),
      React.createElement('div', { style: styles.checkboxRow },
        POS_KEYS.map((key) => React.createElement('label', { key, style: styles.checkbox },
          React.createElement('input', {
            type: 'checkbox',
            checked: (config.posFilter as string[]).includes(key),
            onChange: () => toggle('posFilter', key),
          }),
          React.createElement('span', { style: { color: posColor[key] } }, posText[key]),
        )),
      ),
      React.createElement('span', { style: styles.hint }, '关闭某词性后文字保留，仅移除颜色（无需重新分词）。'),
    ),
    // ── containers ──
    React.createElement('div', { style: styles.field },
      React.createElement('label', { style: styles.label, htmlFor: 'adhdgofly-containers' }, '高亮容器（CSS 选择器，逗号分隔）'),
      React.createElement('input', {
        id: 'adhdgofly-containers',
        type: 'text',
        value: (config.containers as string[]).join(', '),
        style: styles.text,
        placeholder: DEFAULT_CONFIG.containers.join(', '),
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          setField('containers', e.target.value.split(',').map((s) => s.trim()).filter(Boolean)),
      }),
      React.createElement('span', { style: styles.hint }, '默认：对话消息区 [data-conversation-scroll]。可追加其他 Markdown 渲染区选择器。'),
    ),
  )
}

// ── classic section (settings.section) ──────────────────────────────────────

function Section({ scope }: { scope?: SettingsScope<AdhdgoflyConfig> }): React.ReactElement {
  const { config, setField, unsetField } = useAdhdgoflyConfig(scope)
  return React.createElement(ConfigFields, { config, setField, unsetField, onLayoutMode: () => {} })
}

// ── rc.7 card (settings.plugin.item) ────────────────────────────────────────
//
// A third-party card must own its own chrome (bundle-purity gate forbids
// importing the official PluginCard), so we hand-build a titled, collapsible
// card shell that mirrors the official visual language via --dsw-alias-* vars.

const cardShellStyles: Record<string, React.CSSProperties> = {
  card: {
    border: '1px solid var(--dsw-alias-border-l2)',
    background: 'var(--dsw-alias-bg-layer-3)',
    borderRadius: 12,
    listStyle: 'none',
  },
  header: {
    appearance: 'none',
    width: '100%',
    font: 'inherit',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    background: '0 0',
    border: 0,
    borderRadius: 12,
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    display: 'flex',
  },
  headerText: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 },
  name: { color: 'var(--dsw-alias-label-primary)', fontSize: 15, fontWeight: 600, lineHeight: 1.4 },
  description: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, lineHeight: 1.5 },
  chevron: {
    color: 'var(--dsw-alias-label-tertiary)',
    flex: 'none',
    transition: 'transform .16s',
    display: 'inline-flex',
  },
  body: {
    borderTop: '1px solid var(--dsw-alias-border-l2)',
    margin: '0 16px',
    paddingBottom: 8,
    display: 'flex',
    flexDirection: 'column',
  },
}

const CARD_TITLE = 'ADHDGoFly'
const CARD_DESCRIPTION = '词性高亮：名词绿 / 动词红 / 形副紫 / 其他灰。'

/**
 * The official chevron is `IconChevronDownOutline14` (a downward chevron) that
 * rotates `rotate(180deg)` when open. Base = pointing down (collapsed), open =
 * pointing up. We replicate the exact SVG path so the symbol matches.
 */
const CHEVRON_PATH =
  'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z'

function CardShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: React.ReactNode
}): React.ReactElement {
  // Matches the official cards: default collapsed.
  const [open, setOpen] = React.useState(false)
  return React.createElement('li', { style: cardShellStyles.card },
    React.createElement('button', {
      style: cardShellStyles.header,
      type: 'button',
      onClick: () => setOpen((o) => !o),
      'aria-expanded': open,
    },
    React.createElement('span', { style: cardShellStyles.headerText },
      React.createElement('span', { style: cardShellStyles.name }, title),
      React.createElement('span', { style: cardShellStyles.description }, description),
    ),
    // Downward chevron by default; rotate 180° when open (points up).
    React.createElement('span', {
      style: { ...cardShellStyles.chevron, ...(open ? { transform: 'rotate(180deg)' } : null) },
    },
    React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none' },
      React.createElement('path', { d: CHEVRON_PATH, fill: 'currentColor' }),
    ),
    ),
    ),
    open && React.createElement('div', { style: cardShellStyles.body }, children),
  )
}

function Card({ scope }: { scope?: SettingsScope<AdhdgoflyConfig> }): React.ReactElement {
  const { status, config, setField, unsetField } = useAdhdgoflyConfig(scope)
  if (status === 'unavailable') return React.createElement(React.Fragment, null) // remote → render nothing
  return React.createElement(CardShell, { title: CARD_TITLE, description: CARD_DESCRIPTION },
    React.createElement(ConfigFields, { config, setField, unsetField, onLayoutMode: () => {} }),
  )
}

// ── registration ────────────────────────────────────────────────────────────

/**
 * Bind the `adhdgofly` settings scope and register whichever surfaces the
 * current uiLayout selects. uiLayout is read at apply-time, so toggling it
 * takes effect on the next reload.
 */
export function registerSettings(ctx: any): void {
  const slots = ctx.get('slots')
  if (!slots) return

  const binder = ctx.get('settingsScope')
  const scope = binder?.bind?.({ namespace: NS }) as SettingsScope<AdhdgoflyConfig> | undefined

  const mode = loadLayoutMode()

  if (mode === 'both' || mode === 'classic') {
    slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: SECTION_ID, order: 20, label: SECTION_LABEL },
      () => React.createElement(Section, { scope }),
    ))
  }

  if (mode === 'both' || mode === 'plugin-card') {
    slots.inject('settings.plugin.item', () => slots.register(
      { name: 'settings.plugin.item', key: NS },
      () => React.createElement(Card, { scope }),
    ))
  }
}
