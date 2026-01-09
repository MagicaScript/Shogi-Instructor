/**
 * Types and Interfaces for Shogi Pieces
 */
export type PlayerOwner = 'self' | 'opponent'

export type MoveMatrix = number[][]

export type PieceType = 'King' | 'Pawn' | 'Gold'

/**
 * Public interface for ShogiPiece (without protected methods)
 */
export interface IShogiPiece {
  owner: PlayerOwner
  promoted: boolean
  readonly label: string
  getValue(): number
  getMovementMatrix(): MoveMatrix
  promote(): void
}

/**
 * Abstract Base Class for all Shogi Pieces.
 */
export abstract class BaseShogiPiece implements IShogiPiece {
  constructor(
    public owner: PlayerOwner,
    public promoted: boolean = false,
  ) {}

  abstract get label(): string

  abstract getValue(): number

  protected abstract getBaseMatrix(): MoveMatrix

  public getMovementMatrix(): MoveMatrix {
    const base = this.getBaseMatrix()
    if (this.owner === 'self') {
      return base
    } else {
      return base.map((row) => row.slice().reverse()).reverse()
    }
  }

  public promote(): void {
    this.promoted = true
  }
}

class King extends BaseShogiPiece {
  get label() {
    return '王'
  }
  getValue() {
    return 10000
  }
  protected getBaseMatrix(): MoveMatrix {
    return [
      [0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0],
      [0, 1, 0, 1, 0],
      [0, 1, 1, 1, 0],
      [0, 0, 0, 0, 0],
    ]
  }
}

class Pawn extends BaseShogiPiece {
  get label() {
    return this.promoted ? 'と' : '歩'
  }
  getValue() {
    return this.promoted ? 10 : 1
  }
  protected getBaseMatrix(): MoveMatrix {
    if (this.promoted) {
      return new Gold(this.owner).getMovementMatrix()
    }
    return [
      [0, 0, 0, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ]
  }
}

class Gold extends BaseShogiPiece {
  get label() {
    return '金'
  }
  getValue() {
    return 6
  }
  protected getBaseMatrix(): MoveMatrix {
    return [
      [0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0],
      [0, 1, 0, 1, 0],
      [0, 0, 1, 0, 0],
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
      case 'Gold':
        return new Gold(owner)
      default: {
        const _exhaustive: never = type
        throw new Error(`Unknown piece type: ${_exhaustive}`)
      }
    }
  }
}
