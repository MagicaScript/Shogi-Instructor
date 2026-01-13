import type { PlayerColor } from './gameInfo'
import type { Score } from './usi'
import { isObject } from '@/utils/typeGuards'
import { isPlayerColor } from './gameInfo'
import { isScore } from './usi'

export type MoveQuality =
  | 'best'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'forced'
  | 'unknown'

export type MoveHistoryEntry = {
  /** Ply number (1-based). ply=1 is the first move of the game. */
  ply: number
  /** Which side made this move ('sente' or 'gote'). */
  moveBySide: PlayerColor
  /** The actual move in USI format (e.g. '7g7f', 'P*5e'). Null for initial position. */
  usiMove: string | null
  /** SFEN after this move was played. */
  sfenAfter: string
  /** Engine-recommended best move for this position (before the move was made). */
  recommendedBestMove: string | null
  /** Engine evaluation after the move was played. */
  evalAfterMove: Score | null
  /** True when this was the only legal move (forced response). */
  isOnlyMove: boolean
  /** Computed quality of this move. */
  quality?: MoveQuality
}

export function isMoveQuality(v: unknown): v is MoveQuality {
  return (
    v === 'best' ||
    v === 'good' ||
    v === 'inaccuracy' ||
    v === 'mistake' ||
    v === 'blunder' ||
    v === 'forced' ||
    v === 'unknown'
  )
}

export function isMoveHistoryEntry(v: unknown): v is MoveHistoryEntry {
  if (!isObject(v)) return false
  if (typeof v.ply !== 'number' || !Number.isInteger(v.ply) || v.ply < 0) return false
  if (!isPlayerColor(v.moveBySide)) return false
  if (!(typeof v.usiMove === 'string' || v.usiMove === null)) return false
  if (typeof v.sfenAfter !== 'string') return false
  if (!(typeof v.recommendedBestMove === 'string' || v.recommendedBestMove === null)) return false
  if (!(v.evalAfterMove === null || isScore(v.evalAfterMove))) return false
  if (typeof v.isOnlyMove !== 'boolean') return false
  if (v.quality !== undefined && !isMoveQuality(v.quality)) return false
  return true
}

/**
 * Creates a fresh MoveHistoryEntry with minimal data.
 */
export function createMoveHistoryEntry(
  ply: number,
  moveBySide: PlayerColor,
  usiMove: string | null,
  sfenAfter: string,
): MoveHistoryEntry {
  return {
    ply,
    moveBySide,
    usiMove,
    sfenAfter,
    recommendedBestMove: null,
    evalAfterMove: null,
    isOnlyMove: false,
    quality: undefined,
  }
}
