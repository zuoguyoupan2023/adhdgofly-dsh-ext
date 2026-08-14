/**
 * Maps segmentation results to DecoratedWord objects with POS color classes.
 */
import type { Segment, DecoratedWord, PosColorClass } from './types'

const POS_COLOR_MAP: Record<string, PosColorClass> = {
  n: 'pos-n',
  v: 'pos-v',
  adj: 'pos-a',
  a: 'pos-a',
  adv: 'pos-a',
  // PKU Chinese POS tagset noun sub-types → noun color
  nr: 'pos-n',  // 人名
  ns: 'pos-n',  // 地名
  nt: 'pos-n',  // 机构名
  nz: 'pos-n',  // 专名
  // Time words → noun color (semantically noun-like)
  t:  'pos-n',  // 时间词
  // Adverbs → adjective/adverb color
  d:  'pos-a',  // 副词
}

function toPosColorClass(pos: string): PosColorClass {
  const primary = pos.split(',')[0].trim().toLowerCase()
  const result = POS_COLOR_MAP[primary] ?? 'pos-other'
  return result
}

export function matchSegments(
  segments: Segment[],
  minWordLength: number,
  posFilter: string[],
): DecoratedWord[] {
  const results: DecoratedWord[] = []

  for (const seg of segments) {
    if (!seg.is_in_dict || !seg.pos) continue
    if (seg.word.length < minWordLength) continue

    const colorClass = toPosColorClass(seg.pos)
    // Determine filter key: use color class for mapped POS, raw POS as fallback
    const posKey = seg.pos.split(',')[0].trim().toLowerCase()
    let filterKey: string
    if (colorClass === 'pos-n') {
      filterKey = 'n'
    } else if (colorClass === 'pos-v') {
      filterKey = 'v'
    } else if (colorClass === 'pos-a') {
      filterKey = 'a'
    } else {
      filterKey = (posKey === 'adj' || posKey === 'adv') ? 'a' : posKey
    }
    if (!posFilter.includes(filterKey)) continue

    results.push({
      word: seg.word,
      start: seg.start,
      end: seg.end,
      pos: seg.pos,
      colorClass,
    })
  }

  return results
}
