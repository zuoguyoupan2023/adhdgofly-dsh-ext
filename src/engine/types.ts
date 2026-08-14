export interface Segment {
  word: string
  start: number
  end: number
  is_in_dict: boolean
  pos: string | null  // comma-separated, e.g. "v,n"
}

export interface DecoratedWord {
  word: string
  /** Start offset in the full document text */
  start: number
  /** End offset in the full document text */
  end: number
  pos: string
  colorClass: PosColorClass
}

export type PosColorClass = 'pos-n' | 'pos-v' | 'pos-a' | 'pos-other'

export type SupportedLang = 'en' | 'zh' | 'fr' | 'es' | 'ru' | 'ja'

/** A segment of document text with its detected language */
export interface LanguageSegment {
  text: string
  /** Offset of this segment's first character in the full document */
  offset: number
  lang: SupportedLang
}
