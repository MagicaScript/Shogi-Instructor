import type { IShogiPiece, PieceType, PlayerOwner } from '@/logic/shogiPiece'

const BOARD_SIZE = 9
const BOARD_CELLS = 81

function isInside(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE
}

/**
 * Calculate legal destination indices for moving a piece already on board.
 * - matrix cell: 1 => exact jump/step to (dx,dy)
 * - matrix cell: 2 => sliding direction (normalized to unit vector)
 */
export function calculateLegalMovesOnBoard(
  piece: IShogiPiece,
  fromIndex: number,
  cells: (IShogiPiece | null)[],
): number[] {
  const matrix = piece.getMovementMatrix()
  const fx = fromIndex % BOARD_SIZE
  const fy = Math.floor(fromIndex / BOARD_SIZE)

  const moves = new Set<number>()
  const slideDirs = new Map<string, { dx: number; dy: number }>()

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const t = matrix[r]?.[c] ?? 0
      if (t === 0) continue

      const dx = c - 2
      const dy = r - 2
      if (dx === 0 && dy === 0) continue

      if (t === 1) {
        const tx = fx + dx
        const ty = fy + dy
        if (!isInside(tx, ty)) continue

        const to = ty * BOARD_SIZE + tx
        const target = cells[to]
        if (!target || target.owner !== piece.owner) moves.add(to)
      } else if (t === 2) {
        // normalize slide direction (fixes "dx=2 steps by 2" bug)
        const sx = Math.sign(dx)
        const sy = Math.sign(dy)
        if (sx === 0 && sy === 0) continue
        slideDirs.set(`${sx},${sy}`, { dx: sx, dy: sy })
      }
    }
  }

  // slide directions (deduped)
  for (const dir of slideDirs.values()) {
    let tx = fx + dir.dx
    let ty = fy + dir.dy
    while (isInside(tx, ty)) {
      const to = ty * BOARD_SIZE + tx
      const target = cells[to]

      if (!target) {
        moves.add(to)
      } else {
        if (target.owner !== piece.owner) moves.add(to)
        break
      }

      tx += dir.dx
      ty += dir.dy
    }
  }

  return Array.from(moves).sort((a, b) => a - b)
}

function lastRank(owner: PlayerOwner): number {
  return owner === 'self' ? 0 : 8
}

function lastTwoRanks(owner: PlayerOwner): Set<number> {
  return owner === 'self' ? new Set([0, 1]) : new Set([8, 7])
}

function hasUnpromotedPawnInFile(
  owner: PlayerOwner,
  fileX: number,
  cells: (IShogiPiece | null)[],
): boolean {
  for (let y = 0; y < BOARD_SIZE; y++) {
    const idx = y * BOARD_SIZE + fileX
    const p = cells[idx]
    if (p && p.owner === owner && p.type === 'Pawn' && !p.promoted) return true
  }
  return false
}

/**
 * Calculate legal drop squares for a piece in hand.
 * Includes basic Shogi restrictions:
 * - cannot drop onto occupied square
 * - pawn: no "nifu" (two unpromoted pawns in same file)
 * - pawn/lance: cannot drop on last rank
 * - knight: cannot drop on last two ranks
 * (does not include uchifuzume checkmate rule)
 */
export function calculateLegalDrops(
  pieceType: PieceType,
  owner: PlayerOwner,
  cells: (IShogiPiece | null)[],
): number[] {
  const targets: number[] = []
  const lr = lastRank(owner)
  const l2 = lastTwoRanks(owner)

  for (let i = 0; i < BOARD_CELLS; i++) {
    if (cells[i]) continue

    const x = i % BOARD_SIZE
    const y = Math.floor(i / BOARD_SIZE)

    if ((pieceType === 'Pawn' || pieceType === 'Lance') && y === lr) continue
    if (pieceType === 'Knight' && l2.has(y)) continue
    if (pieceType === 'Pawn' && hasUnpromotedPawnInFile(owner, x, cells)) continue

    targets.push(i)
  }

  return targets
}
