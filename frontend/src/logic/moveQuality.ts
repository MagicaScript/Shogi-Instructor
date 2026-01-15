/* src/logic/moveQuality.ts */

import type { MoveHistoryEntry, MoveQuality } from '@/schemes/moveHistory'
import type { Score } from '@/schemes/usi'

/**
 * Normalizes a USI move string for comparison.
 * - Trims whitespace
 * - Converts to lowercase
 */
export function normalizeUsi(usi: string | null | undefined): string {
  if (!usi) return ''
  return usi.trim().toLowerCase()
}

/**
 * Compares two USI moves for equality after normalization.
 */
export function usiEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeUsi(a)
  const nb = normalizeUsi(b)
  if (na.length === 0 || nb.length === 0) return false
  return na === nb
}

/**
 * Extracts centipawn value from a Score, returning null if not applicable.
 * For mate scores, returns a large value (positive or negative).
 */
export function scoreToEvalDrop(score: Score | null | undefined): number | null {
  if (!score) return null
  if (score.type === 'none') return null
  if (score.type === 'cp') return score.value
  if (score.type === 'mate') {
    if (score.value === 'unknown') return null
    // Mate in N moves: use a very large value, sign indicates side
    // Positive = winning, negative = losing
    const sign = score.value >= 0 ? 1 : -1
    return sign * (100000 - Math.abs(score.value) * 100)
  }
  return null
}

/**
 * Computes the evaluation drop between two scores.
 * Returns the change from the perspective of the side that just moved.
 * Negative value = position got worse for the moving side.
 *
 * @param evalBefore Score before the move (from previous analysis, side-to-move perspective)
 * @param evalAfter Score after the move (from current analysis, opponent's perspective)
 * @returns The eval drop , or null if cannot compute.
 */
export function computeEvalDrop(
  evalBefore: Score | null | undefined,
  evalAfter: Score | null | undefined,
): number | null {
  const cpBefore = scoreToEvalDrop(evalBefore)
  const cpAfter = scoreToEvalDrop(evalAfter)

  if (cpBefore === null || cpAfter === null) return null

  // evalBefore was from side-to-move perspective (before the move)
  // evalAfter is from the NEW side-to-move perspective (opponent)
  // So we need to negate evalAfter to get the same perspective
  const cpAfterFlipped = -cpAfter

  return cpAfterFlipped - cpBefore
}

/**
 * Classifies the quality of a move based on eval drop.
 */
export function classifyByEvalDrop(evalDrop: number): MoveQuality {
  // Thresholds (in eval)
  // These are typical values used in chess analysis
  if (evalDrop >= -50) return 'good'
  if (evalDrop >= -200) return 'inaccuracy'
  if (evalDrop >= -500) return 'mistake'
  return 'blunder'
}

/**
 * Computes the quality of a move based on the history entry data.
 *
 * Priority:
 * 1. If no usiMove, return 'unknown'
 * 2. If isOnlyMove, return 'forced'
 * 3. If usiMove matches recommendedBestMove, return 'best'
 * 4. Otherwise return 'unknown' (eval-based classification requires evalBeforeMove)
 */
export function computeMoveQuality(entry: MoveHistoryEntry): MoveQuality {
  if (!entry.usiMove) return 'unknown'

  if (entry.isOnlyMove) return 'forced'

  if (usiEquals(entry.usiMove, entry.recommendedBestMove)) {
    return 'best'
  }

  // For eval-based classification, we would need evalBeforeMove
  // which requires looking at the previous entry.
  // This is handled in computeMoveQualityWithContext.
  return 'unknown'
}

/**
 * Computes move quality with context from the previous move's analysis.
 *
 * @param entry The current move entry
 * @param evalBeforeMove The engine eval from the position before this move was made
 */
export function computeMoveQualityWithContext(
  entry: MoveHistoryEntry,
  evalBeforeMove: Score | null | undefined,
): MoveQuality {
  if (!entry.usiMove) return 'unknown'

  if (entry.isOnlyMove) return 'forced'

  if (usiEquals(entry.usiMove, entry.recommendedBestMove)) {
    return 'best'
  }

  // Try eval-based classification
  const evalDrop = computeEvalDrop(evalBeforeMove, entry.evalAfterMove)
  if (evalDrop !== null) {
    return classifyByEvalDrop(evalDrop)
  }

  return 'unknown'
}

/**
 * Returns a human-readable label for a move quality.
 */
export function moveQualityLabel(quality: MoveQuality): string {
  switch (quality) {
    case 'best':
      return 'Best Move'
    case 'good':
      return 'Good Move'
    case 'inaccuracy':
      return 'Inaccuracy'
    case 'mistake':
      return 'Mistake'
    case 'blunder':
      return 'Blunder'
    case 'forced':
      return 'Forced Move'
    case 'unknown':
    default:
      return 'Unknown'
  }
}
