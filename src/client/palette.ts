/**
 * POS color palettes — carried over from adhdgofly-ide-ext
 * (src/preview/highlighter.ts + src/vscode/decorator.ts, MIT).
 *
 * Compact dictionary keys: 'n' (noun) | 'v' (verb) | 'a' (adj/adv) | 'o' (other).
 */

export const POS_KEYS = ['n', 'v', 'a', 'o'] as const
export type PosKey = (typeof POS_KEYS)[number]

export const DARK_PALETTE: Record<PosKey, string> = {
  n: '#4ade80',
  v: '#f87171',
  a: '#a78bfa',
  o: '#9ca3af',
}

export const LIGHT_PALETTE: Record<PosKey, string> = {
  n: '#059669',
  v: '#dc2626',
  a: '#7c3aed',
  o: '#6b7280',
}

export function isPosKey(value: unknown): value is PosKey {
  return typeof value === 'string' && (POS_KEYS as readonly string[]).includes(value)
}

/** Map an engine color class ('pos-n' | 'pos-v' | 'pos-a' | 'pos-other') to a compact key. */
export function colorClassToKey(colorClass: string): PosKey {
  switch (colorClass) {
    case 'pos-n': return 'n'
    case 'pos-v': return 'v'
    case 'pos-a': return 'a'
    default: return 'o'
  }
}

/** Convert a #rrggbb hex color to an rgba() string with the given alpha. */
export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
