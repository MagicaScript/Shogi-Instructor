import type { UsiScore } from './usi'
import { isUsiScore } from './usi'

export type EngineAnalysisPayload = {
  sfen: string
  bestmove: string | null
  ponder: string | null
  score: UsiScore
  pv: string[]
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

export function isEngineAnalysisPayload(v: unknown): v is EngineAnalysisPayload {
  if (!isObject(v)) return false
  if (typeof v.sfen !== 'string') return false
  if (!(typeof v.bestmove === 'string' || v.bestmove === null)) return false
  if (!(typeof v.ponder === 'string' || v.ponder === null)) return false
  if (!isUsiScore(v.score)) return false
  if (!isStringArray(v.pv)) return false
  return true
}

export function normalizeSfen(sfen: string): string {
  return sfen.trim().replace(/\s+/g, ' ')
}
