import {
  ShogiPieceFactory,
  type IShogiPiece,
  type PieceType,
  type PlayerOwner,
} from '@/logic/shogiPiece'
import type { KomadaiItem } from '@/utils/sfenUtils'

const BOARD_SIZE = 9
const BOARD_CELLS = 81

function isInside(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE
}

export type KomadaiByOwner = {
  self: KomadaiItem[]
  opponent: KomadaiItem[]
}

function opponentOwner(owner: PlayerOwner): PlayerOwner {
  return owner === 'self' ? 'opponent' : 'self'
}

function clonePiece(piece: IShogiPiece, promoted: boolean = piece.promoted): IShogiPiece {
  const clone = ShogiPieceFactory.create(piece.type, piece.owner)
  if (promoted) clone.promote()
  return clone
}

function cloneCells(cells: (IShogiPiece | null)[]): (IShogiPiece | null)[] {
  return cells.slice()
}

/**
 * Calculate pseudo-legal destination indices for moving a piece already on board.
 * - matrix cell: 1 => exact jump/step to (dx,dy)
 * - matrix cell: 2 => sliding direction (normalized to unit vector)
 */
function calculatePseudoLegalMovesOnBoard(
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

export function isInPromotionZoneIndex(owner: PlayerOwner, index: number): boolean {
  const y = Math.floor(index / BOARD_SIZE)
  return owner === 'self' ? y <= 2 : y >= 6
}

export function canPromotePiece(piece: IShogiPiece): boolean {
  if (piece.promoted) return false
  return !['King', 'Gold'].includes(piece.type)
}

function lastRank(owner: PlayerOwner): number {
  return owner === 'self' ? 0 : 8
}

function lastTwoRanks(owner: PlayerOwner): Set<number> {
  return owner === 'self' ? new Set([0, 1]) : new Set([8, 7])
}

export function isPromotionMandatory(
  pieceType: PieceType,
  owner: PlayerOwner,
  toIndex: number,
): boolean {
  const y = Math.floor(toIndex / BOARD_SIZE)
  if (pieceType === 'Pawn' || pieceType === 'Lance') return y === lastRank(owner)
  if (pieceType === 'Knight') return lastTwoRanks(owner).has(y)
  return false
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

function findKingIndex(owner: PlayerOwner, cells: (IShogiPiece | null)[]): number | null {
  for (let i = 0; i < BOARD_CELLS; i++) {
    const p = cells[i]
    if (p && p.owner === owner && p.type === 'King') return i
  }
  return null
}

function isSquareAttacked(
  targetIndex: number,
  attacker: PlayerOwner,
  cells: (IShogiPiece | null)[],
): boolean {
  for (let i = 0; i < BOARD_CELLS; i++) {
    const p = cells[i]
    if (!p || p.owner !== attacker) continue
    const moves = calculatePseudoLegalMovesOnBoard(p, i, cells)
    if (moves.includes(targetIndex)) return true
  }
  return false
}

export function isInCheck(owner: PlayerOwner, cells: (IShogiPiece | null)[]): boolean {
  const kingIndex = findKingIndex(owner, cells)
  if (kingIndex === null) return false
  return isSquareAttacked(kingIndex, opponentOwner(owner), cells)
}

function simulateMove(
  cells: (IShogiPiece | null)[],
  fromIndex: number,
  toIndex: number,
  promote: boolean = false,
): (IShogiPiece | null)[] {
  const next = cloneCells(cells)
  const piece = cells[fromIndex]
  if (!piece) return next
  const moved = clonePiece(piece, promote || piece.promoted)
  next[fromIndex] = null
  next[toIndex] = moved
  return next
}

function simulateDrop(
  cells: (IShogiPiece | null)[],
  toIndex: number,
  pieceType: PieceType,
  owner: PlayerOwner,
): (IShogiPiece | null)[] {
  const next = cloneCells(cells)
  next[toIndex] = ShogiPieceFactory.create(pieceType, owner)
  return next
}

function isMoveKingSafe(
  piece: IShogiPiece,
  fromIndex: number,
  toIndex: number,
  cells: (IShogiPiece | null)[],
): boolean {
  const next = simulateMove(cells, fromIndex, toIndex)
  return !isInCheck(piece.owner, next)
}

function isDropKingSafe(
  owner: PlayerOwner,
  toIndex: number,
  pieceType: PieceType,
  cells: (IShogiPiece | null)[],
): boolean {
  const next = simulateDrop(cells, toIndex, pieceType, owner)
  return !isInCheck(owner, next)
}

function getKomadaiForOwner(owner: PlayerOwner, komadaiByOwner: KomadaiByOwner): KomadaiItem[] {
  return owner === 'self' ? komadaiByOwner.self : komadaiByOwner.opponent
}

function hasAnyLegalMove(
  owner: PlayerOwner,
  cells: (IShogiPiece | null)[],
  komadaiByOwner?: KomadaiByOwner,
): boolean {
  for (let i = 0; i < BOARD_CELLS; i++) {
    const p = cells[i]
    if (!p || p.owner !== owner) continue
    const legal = calculateLegalMovesOnBoard(p, i, cells)
    if (legal.length > 0) return true
  }

  if (!komadaiByOwner) return false

  const hand = getKomadaiForOwner(owner, komadaiByOwner)
  for (const item of hand) {
    if (item.count <= 0) continue
    const drops = calculateLegalDrops(item.type, owner, cells, komadaiByOwner)
    if (drops.length > 0) return true
  }

  return false
}

export function isCheckmate(
  owner: PlayerOwner,
  cells: (IShogiPiece | null)[],
  komadaiByOwner?: KomadaiByOwner,
): boolean {
  if (!isInCheck(owner, cells)) return false
  return !hasAnyLegalMove(owner, cells, komadaiByOwner)
}

/**
 * Calculate legal destination indices for moving a piece already on board.
 * Filters out self-check moves.
 */
export function calculateLegalMovesOnBoard(
  piece: IShogiPiece,
  fromIndex: number,
  cells: (IShogiPiece | null)[],
): number[] {
  const pseudo = calculatePseudoLegalMovesOnBoard(piece, fromIndex, cells)
  return pseudo.filter((to) => isMoveKingSafe(piece, fromIndex, to, cells))
}

type HangingPiece = {
  index: number
  piece: IShogiPiece
  value: number
  code: string
  square: string
  distanceToOpponentKing: number
}

function pieceCode(piece: IShogiPiece): string {
  const base = (() => {
    switch (piece.type) {
      case 'King':
        return 'K'
      case 'Gold':
        return 'G'
      case 'Silver':
        return 'S'
      case 'Knight':
        return 'N'
      case 'Lance':
        return 'L'
      case 'Pawn':
        return 'P'
      case 'Bishop':
        return 'B'
      case 'Rook':
        return 'R'
    }
  })()
  if (!piece.promoted) return base
  return `+${base}`
}

function pieceValue(piece: IShogiPiece): number {
  const promoted = piece.promoted
  switch (piece.type) {
    case 'Rook':
      return promoted ? 11 : 9
    case 'Bishop':
      return promoted ? 10 : 8
    case 'Gold':
      return 6
    case 'Silver':
      return promoted ? 6 : 5
    case 'Knight':
      return promoted ? 6 : 4
    case 'Lance':
      return promoted ? 6 : 3
    case 'Pawn':
      return promoted ? 7 : 1
    case 'King':
      return 0
  }
}

function indexToUsiSquare(index: number): string {
  const x = index % BOARD_SIZE
  const y = Math.floor(index / BOARD_SIZE)
  const file = 9 - x
  const rank = String.fromCharCode('a'.charCodeAt(0) + y)
  return `${file}${rank}`
}

function manhattanDistance(a: number, b: number): number {
  const ax = a % BOARD_SIZE
  const ay = Math.floor(a / BOARD_SIZE)
  const bx = b % BOARD_SIZE
  const by = Math.floor(b / BOARD_SIZE)
  return Math.abs(ax - bx) + Math.abs(ay - by)
}

function isSquareLegallyAttackable(
  targetIndex: number,
  attacker: PlayerOwner,
  cells: (IShogiPiece | null)[],
): boolean {
  for (let i = 0; i < BOARD_CELLS; i++) {
    const p = cells[i]
    if (!p || p.owner !== attacker) continue
    const moves = calculateLegalMovesOnBoard(p, i, cells)
    if (moves.includes(targetIndex)) return true
  }
  return false
}

type LegalAttacker = {
  fromIndex: number
  piece: IShogiPiece
}

function findLegalAttackers(
  targetIndex: number,
  attackerOwner: PlayerOwner,
  cells: (IShogiPiece | null)[],
): LegalAttacker[] {
  const attackers: LegalAttacker[] = []
  for (let i = 0; i < BOARD_CELLS; i++) {
    const p = cells[i]
    if (!p || p.owner !== attackerOwner) continue
    const moves = calculateLegalMovesOnBoard(p, i, cells)
    if (moves.includes(targetIndex)) attackers.push({ fromIndex: i, piece: p })
  }
  return attackers
}

function simulateCapture(
  cells: (IShogiPiece | null)[],
  fromIndex: number,
  toIndex: number,
): (IShogiPiece | null)[] {
  const next = cloneCells(cells)
  const attacker = cells[fromIndex]
  if (!attacker) return next
  next[fromIndex] = null
  next[toIndex] = attacker
  return next
}

function hasLegalRecaptureAfterCapture(
  targetIndex: number,
  targetOwner: PlayerOwner,
  cells: (IShogiPiece | null)[],
): boolean {
  const attackers = findLegalAttackers(targetIndex, opponentOwner(targetOwner), cells)
  if (attackers.length === 0) return false

  for (const attacker of attackers) {
    const next = simulateCapture(cells, attacker.fromIndex, targetIndex)
    for (let i = 0; i < BOARD_CELLS; i++) {
      if (i === targetIndex) continue
      const p = next[i]
      if (!p || p.owner !== targetOwner) continue
      const moves = calculateLegalMovesOnBoard(p, i, next)
      if (moves.includes(targetIndex)) return true
    }
  }

  return false
}

export function findHangingPieces(
  cells: (IShogiPiece | null)[],
  targetOwner: PlayerOwner,
): HangingPiece[] {
  const opponent = opponentOwner(targetOwner)
  const opponentKingIndex = findKingIndex(opponent, cells)
  const hanging: HangingPiece[] = []

  for (let i = 0; i < BOARD_CELLS; i++) {
    const p = cells[i]
    if (!p || p.owner !== targetOwner) continue
    if (p.type === 'King') continue

    if (!isSquareLegallyAttackable(i, opponent, cells)) continue
    if (hasLegalRecaptureAfterCapture(i, targetOwner, cells)) continue

    const value = pieceValue(p)
    const code = pieceCode(p)
    const square = indexToUsiSquare(i)
    const distanceToOpponentKing =
      opponentKingIndex === null
        ? Number.POSITIVE_INFINITY
        : manhattanDistance(i, opponentKingIndex)

    hanging.push({ index: i, piece: p, value, code, square, distanceToOpponentKing })
  }

  return hanging
}

export function pickTopHangingPiece(hanging: HangingPiece[]): HangingPiece | null {
  if (hanging.length === 0) return null
  const first = hanging[0]
  if (!first) return null
  let best = first
  for (let i = 1; i < hanging.length; i++) {
    const cur = hanging[i]
    if (!cur) continue
    if (cur.value > best.value) {
      best = cur
      continue
    }
    if (cur.value === best.value && cur.distanceToOpponentKing < best.distanceToOpponentKing) {
      best = cur
    }
  }
  return best
}

export function findTopHangingPieceLabel(
  cells: (IShogiPiece | null)[],
  targetOwner: PlayerOwner,
): string | null {
  const hanging = findHangingPieces(cells, targetOwner)
  const best = pickTopHangingPiece(hanging)
  if (!best) return null
  return `${best.code}@${best.square}`
}

function isPawnDropMate(
  owner: PlayerOwner,
  toIndex: number,
  cells: (IShogiPiece | null)[],
  komadaiByOwner: KomadaiByOwner,
): boolean {
  const next = simulateDrop(cells, toIndex, 'Pawn', owner)
  const defender = opponentOwner(owner)
  if (!isInCheck(defender, next)) return false
  return !hasAnyLegalMove(defender, next, komadaiByOwner)
}

/**
 * Calculate legal drop squares for a piece in hand.
 * Includes basic Shogi restrictions:
 * - cannot drop onto occupied square
 * - pawn: no "nifu" (two unpromoted pawns in same file)
 * - pawn/lance: cannot drop on last rank
 * - knight: cannot drop on last two ranks
 * - pawn: no pawn-drop mate (uchifuzume)
 */
export function calculateLegalDrops(
  pieceType: PieceType,
  owner: PlayerOwner,
  cells: (IShogiPiece | null)[],
  komadaiByOwner?: KomadaiByOwner,
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

    if (!isDropKingSafe(owner, i, pieceType, cells)) continue
    if (pieceType === 'Pawn' && komadaiByOwner) {
      if (isPawnDropMate(owner, i, cells, komadaiByOwner)) continue
    }

    targets.push(i)
  }

  return targets
}
