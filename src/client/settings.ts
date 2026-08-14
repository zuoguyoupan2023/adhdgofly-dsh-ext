/**
 * Settings section (settings.section slot) for adhdgofly-dsh-ext.
 *
 * Registered by the client plugin; the user reaches it via Settings →
 * ADHDGoFly. All controls write through to the live highlighter immediately
 * and persist to localStorage (v1; host-side settings storage is a v2 path).
 */

import * as React from 'react'
import {
  DEFAULT_CONFIG,
  loadPersistedConfig,
  savePersistedConfig,
  type AdhdgoflyConfig,
} from './config'
import { updateHighlighterConfig } from './state'
import { POS_KEYS } from './palette'

export const SECTION_ID = 'adhdgofly'
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

function Section(): React.ReactElement {
  const [config, setConfig] = React.useState<AdhdgoflyConfig>(() => loadPersistedConfig())

  const apply = (next: AdhdgoflyConfig) => {
    setConfig(next)
    savePersistedConfig(next)
    updateHighlighterConfig(next)
  }

  const toggle = (key: 'languages' | 'posFilter', value: string) => {
    const list = config[key] as string[]
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
    apply({ ...config, [key]: next })
  }

  const posColor: Record<string, string> = { n: '#059669', v: '#dc2626', a: '#7c3aed', o: '#6b7280' }

  return React.createElement(
    'div',
    { style: styles.root },
    // ── enabled ──
    React.createElement('label', { style: styles.checkbox },
      React.createElement('input', {
        type: 'checkbox',
        checked: config.enabled,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => apply({ ...config, enabled: e.target.checked }),
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
          if (Number.isFinite(n)) apply({ ...config, minWordLength: Math.max(1, n) })
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
          apply({ ...config, decorationStyle: e.target.value as AdhdgoflyConfig['decorationStyle'] }),
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
          React.createElement('span', { style: { color: posColor[key] } },
            ({ n: '名词 noun', v: '动词 verb', a: '形/副 adj/adv', o: '其他 other' } as Record<string, string>)[key],
          ),
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
          apply({
            ...config,
            containers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
          }),
      }),
      React.createElement('span', { style: styles.hint }, '默认：对话消息区 [data-conversation-scroll]。可追加其他 Markdown 渲染区选择器。'),
    ),
  )
}

/** Register the settings section once the settings.section declaration is live. */
export function registerSettingsSection(ctx: any): void {
  const slots = ctx.get('slots')
  if (!slots) return
  slots.inject('settings.section', () => slots.register(
    { name: 'settings.section', id: SECTION_ID, order: 20, label: SECTION_LABEL },
    Section,
  ))
}
