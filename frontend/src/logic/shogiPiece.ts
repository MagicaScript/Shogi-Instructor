/**
 * Types and Interfaces for Shogi Pieces
 */
export type PlayerOwner = 'self' | 'opponent'

/**
 * 0 = cannot move
 * 1 = can move to that offset (step/jump)
 * 2 = can slide in that direction (unit vector derived from offset sign)
 */
export type MoveMatrix = number[][]
export type PieceType = 'King' | 'Pawn' | 'Lance' | 'Knight' | 'Silver' | 'Gold' | 'Bishop' | 'Rook'

export interface IShogiPiece {
  readonly type: PieceType
  owner: PlayerOwner
  promoted: boolean
  readonly label: string
  getValue(): number
  getMovementMatrix(): MoveMatrix
  promote(): void
}

function cloneMatrix(m: MoveMatrix): MoveMatrix {
  return m.map((row) => row.slice())
}

const KING_BASE: MoveMatrix = [
  [0, 0, 0, 0, 0],
  [0, 1, 1, 1, 0],
  [0, 1, 0, 1, 0],
  [0, 1, 1, 1, 0],
  [0, 0, 0, 0, 0],
]

const GOLD_BASE: MoveMatrix = [
  [0, 0, 0, 0, 0],
  [0, 1, 1, 1, 0],
  [0, 1, 0, 1, 0],
  [0, 0, 1, 0, 0],
  [0, 0, 0, 0, 0],
]

const PAWN_BASE: MoveMatrix = [
  [0, 0, 0, 0, 0],
  [0, 0, 1, 0, 0],
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
]

const LANCE_BASE: MoveMatrix = [
  [0, 0, 0, 0, 0],
  [0, 0, 2, 0, 0],
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
]

const KNIGHT_BASE: MoveMatrix = [
  [0, 1, 0, 1, 0],
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
]

const SILVER_BASE: MoveMatrix = [
  [0, 0, 0, 0, 0],
  [0, 1, 1, 1, 0],
  [0, 0, 0, 0, 0],
  [0, 1, 0, 1, 0],
  [0, 0, 0, 0, 0],
]

const BISHOP_BASE: MoveMatrix = [
  [0, 0, 0, 0, 0],
  [0, 2, 0, 2, 0],
  [0, 0, 0, 0, 0],
  [0, 2, 0, 2, 0],
  [0, 0, 0, 0, 0],
]

const ROOK_BASE: MoveMatrix = [
  [0, 0, 0, 0, 0],
  [0, 0, 2, 0, 0],
  [0, 2, 0, 2, 0],
  [0, 0, 2, 0, 0],
  [0, 0, 0, 0, 0],
]

/**
 * Abstract Base Class for all Shogi Pieces.
 * Matrix is defined from "self" perspective; opponent is rotated 180 degrees.
 */
export abstract class BaseShogiPiece implements IShogiPiece {
  constructor(
    public owner: PlayerOwner,
    public promoted: boolean = false,
  ) {}

  abstract get type(): PieceType
  abstract get label(): string
  abstract getValue(): number
  protected abstract getBaseMatrix(): MoveMatrix

  public getMovementMatrix(): MoveMatrix {
    const base = cloneMatrix(this.getBaseMatrix())
    if (this.owner === 'self') return base
    return base.map((row) => row.slice().reverse()).reverse()
  }

  public promote(): void {
    this.promoted = true
  }
}

class King extends BaseShogiPiece {
  get type(): PieceType {
    return 'King'
  }
  get label() {
    return '王'
  }
  getValue() {
    return 10000
  }
  protected getBaseMatrix(): MoveMatrix {
    return KING_BASE
  }
}

class Gold extends BaseShogiPiece {
  get type(): PieceType {
    return 'Gold'
  }
  get label() {
    return '金'
  }
  getValue() {
    return 6
  }
  protected getBaseMatrix(): MoveMatrix {
    return GOLD_BASE
  }
}

class Pawn extends BaseShogiPiece {
  get type(): PieceType {
    return 'Pawn'
  }
  get label() {
    return this.promoted ? 'と' : '歩'
  }
  getValue() {
    return this.promoted ? 10 : 1
  }
  protected getBaseMatrix(): MoveMatrix {
    // IMPORTANT: return Gold BASE matrix (not getMovementMatrix), avoid double flipping.
    return this.promoted ? GOLD_BASE : PAWN_BASE
  }
}

class Lance extends BaseShogiPiece {
  get type(): PieceType {
    return 'Lance'
  }
  get label() {
    return this.promoted ? '成香' : '香'
  }
  getValue() {
    return this.promoted ? 10 : 3
  }
  protected getBaseMatrix(): MoveMatrix {
    return this.promoted ? GOLD_BASE : LANCE_BASE
  }
}

class Knight extends BaseShogiPiece {
  get type(): PieceType {
    return 'Knight'
  }
  get label() {
    return this.promoted ? '圭' : '桂'
  }
  getValue() {
    return this.promoted ? 10 : 4
  }
  protected getBaseMatrix(): MoveMatrix {
    return this.promoted ? GOLD_BASE : KNIGHT_BASE
  }
}

class Silver extends BaseShogiPiece {
  get type(): PieceType {
    return 'Silver'
  }
  get label() {
    return this.promoted ? '成銀' : '銀'
  }
  getValue() {
    return this.promoted ? 10 : 5
  }
  protected getBaseMatrix(): MoveMatrix {
    return this.promoted ? GOLD_BASE : SILVER_BASE
  }
}

class Bishop extends BaseShogiPiece {
  get type(): PieceType {
    return 'Bishop'
  }
  get label() {
    return this.promoted ? '馬' : '角'
  }
  getValue() {
    return this.promoted ? 13 : 8
  }
  protected getBaseMatrix(): MoveMatrix {
    if (!this.promoted) return BISHOP_BASE
    // Horse = bishop slides + 1-step orthogonals
    return [
      [0, 0, 0, 0, 0],
      [0, 2, 1, 2, 0],
      [0, 1, 0, 1, 0],
      [0, 2, 1, 2, 0],
      [0, 0, 0, 0, 0],
    ]
  }
}

class Rook extends BaseShogiPiece {
  get type(): PieceType {
    return 'Rook'
  }
  get label() {
    return this.promoted ? '龍' : '飛'
  }
  getValue() {
    return this.promoted ? 15 : 10
  }
  protected getBaseMatrix(): MoveMatrix {
    if (!this.promoted) return ROOK_BASE
    // Dragon = rook slides + 1-step diagonals
    return [
      [0, 0, 0, 0, 0],
      [0, 1, 2, 1, 0],
      [0, 2, 0, 2, 0],
      [0, 1, 2, 1, 0],
      [0, 0, 0, 0, 0],
    ]
  }
}

/**
 * Factory Class for constructing Shogi pieces.
 */
export class ShogiPieceFactory {
  static create(type: PieceType, owner: PlayerOwner): BaseShogiPiece {
    switch (type) {
      case 'King':
        return new King(owner)
      case 'Pawn':
        return new Pawn(owner)
      case 'Lance':
        return new Lance(owner)
      case 'Knight':
        return new Knight(owner)
      case 'Silver':
        return new Silver(owner)
      case 'Gold':
        return new Gold(owner)
      case 'Bishop':
        return new Bishop(owner)
      case 'Rook':
        return new Rook(owner)
      default: {
        const _exhaustive: never = type
        throw new Error(`Unknown piece type: ${_exhaustive}`)
      }
    }
  }
}
