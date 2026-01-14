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

/**
 * Normalizes a SFEN string for comparison.
 * Strips the move number (4th field) since Lishogi and engine may differ.
 * Format: "<board> <turn> <hands> [moveNumber]" -> "<board> <turn> <hands>"
 */
export function normalizeSfen(sfen: string): string {
  const trimmed = sfen.trim().replace(/\s+/g, ' ')
  // Split into parts: board, turn, hands, [moveNumber]
  const parts = trimmed.split(' ')
  // Keep only the first 3 parts (board, turn, hands), ignore move number
  if (parts.length >= 3) {
    return `${parts[0]} ${parts[1]} ${parts[2]}`
  }
  return trimmed
}
