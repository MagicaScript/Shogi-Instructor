import { isObject } from '@/utils/typeGuards'

export type Score =
  | { type: 'cp'; value: number }
  | { type: 'mate'; value: number | 'unknown' }
  | { type: 'none' }

export function isScore(v: unknown): v is Score {
  if (!isObject(v)) return false
  const t = v.type
  if (t === 'none') return true

  if (t === 'cp') {
    return typeof v.value === 'number' && Number.isFinite(v.value)
  }

  if (t === 'mate') {
    return (
      v.value === 'unknown' ||
      (typeof v.value === 'number' && Number.isFinite(v.value) && Number.isInteger(v.value))
    )
  }

  return false
}

export function normalizeScore(score: Score | undefined): Score {
  if (!score) return { type: 'none' }
  if (score.type === 'cp') return { type: 'cp', value: Math.trunc(score.value) }
  if (score.type === 'mate')
    return { type: 'mate', value: score.value === 'unknown' ? 'unknown' : Math.trunc(score.value) }
  return { type: 'none' }
}

export function scoreToKey(score: Score | undefined): string {
  const s = normalizeScore(score)
  if (s.type === 'none') return 'none'
  if (s.type === 'cp') return `cp:${s.value}`
  return s.value === 'unknown' ? 'mate:?' : `mate:${s.value}`
}
