import type { Score } from './usi'
import { isScore } from './usi'
import { isObject } from '@/utils/typeGuards'

export type EngineAnalysisPayload = {
  sfen: string
  bestmove: string | null
  ponder: string | null
  score: Score
  pv: string[]
  /** True when only one legal move exists (e.g. forced response to check). */
  isOnlyMove: boolean
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

export function isEngineAnalysisPayload(v: unknown): v is EngineAnalysisPayload {
  if (!isObject(v)) return false
  if (typeof v.sfen !== 'string') return false
  if (!(typeof v.bestmove === 'string' || v.bestmove === null)) return false
  if (!(typeof v.ponder === 'string' || v.ponder === null)) return false
  if (!isScore(v.score)) return false
  if (!isStringArray(v.pv)) return false
  if (typeof v.isOnlyMove !== 'boolean') return false
  return true
}

export function normalizeSfen(sfen: string): string {
  return sfen.trim().replace(/\s+/g, ' ')
}
