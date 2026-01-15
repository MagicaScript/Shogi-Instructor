import {
  ShogiPieceFactory,
  type IShogiPiece,
  type PlayerOwner,
  type PieceType,
} from '@/logic/shogiPiece'

export interface KomadaiItem {
  label: string
  count: number
  type: PieceType
}

export interface SfenParseResult {
  boardState: Map<number, IShogiPiece>
  turn: PlayerOwner
  myKomadai: KomadaiItem[]
  opponentKomadai: KomadaiItem[]
}

type ParsedSfenPiece = {
  type: PieceType
  promoted: boolean
}

const SFEN_PIECE_MAP: Record<string, ParsedSfenPiece> = {
  P: { type: 'Pawn', promoted: false },
  L: { type: 'Lance', promoted: false },
  N: { type: 'Knight', promoted: false },
  S: { type: 'Silver', promoted: false },
  G: { type: 'Gold', promoted: false },
  K: { type: 'King', promoted: false },
  B: { type: 'Bishop', promoted: false },
  R: { type: 'Rook', promoted: false },

  '+P': { type: 'Pawn', promoted: true },
  '+L': { type: 'Lance', promoted: true },
  '+N': { type: 'Knight', promoted: true },
  '+S': { type: 'Silver', promoted: true },
  '+B': { type: 'Bishop', promoted: true },
  '+R': { type: 'Rook', promoted: true },
}

const PIECE_TYPE_TO_SFEN: Record<PieceType, string> = {
  Pawn: 'P',
  Lance: 'L',
  Knight: 'N',
  Silver: 'S',
  Gold: 'G',
  King: 'K',
  Bishop: 'B',
  Rook: 'R',
}

const PIECE_LABEL_MAP: Record<PieceType, string> = {
  Pawn: '歩',
  Lance: '香',
  Knight: '桂',
  Silver: '銀',
  Gold: '金',
  King: '王',
  Bishop: '角',
  Rook: '飛',
}

const BOARD_SIZE = 9
const BOARD_CELLS = 81
const USI_RANK_A_CODE = 'a'.charCodeAt(0)
const USI_RANK_I_CODE = 'i'.charCodeAt(0)

function isDigitChar(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return code >= 48 && code <= 57
}

function charAtOrThrow(str: string, idx: number, message: string): string {
  const ch = str[idx]
  if (ch === undefined) throw new Error(message)
  return ch
}

function assertDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message)
  return value
}

/**
 * Parse SFEN string into game state.
 * SFEN format: "<board> <turn> <hands> <moveNumber(optional)>"
 */
export function parseSFEN(sfen: string): SfenParseResult {
  const parts = sfen.trim().split(/\s+/)
  const boardStr = parts[0]
  const turnChar = parts[1]
  const handStr = parts[2]

  if (!boardStr || !turnChar || handStr === undefined) {
    throw new Error('Invalid SFEN: expected at least "<board> <turn> <hands>"')
  }
  if (turnChar !== 'b' && turnChar !== 'w') {
    throw new Error(`Invalid SFEN turn: expected "b" or "w", got "${turnChar}"`)
  }

  const rows = boardStr.split('/')
  if (rows.length !== BOARD_SIZE) {
    throw new Error(`Invalid SFEN board: expected 9 rows, got ${rows.length}`)
  }

  const boardState = new Map<number, IShogiPiece>()

  let cellIndex = 0

  for (let rowIdx = 0; rowIdx < BOARD_SIZE; rowIdx += 1) {
    const row = assertDefined(rows[rowIdx], `Invalid SFEN row at index ${rowIdx}`)
    let i = 0
    let filledInRow = 0

    while (i < row.length) {
      const ch = charAtOrThrow(row, i, `Unexpected end of row ${rowIdx + 1}`)

      if (isDigitChar(ch)) {
        const empties = parseInt(ch, 10)
        if (!Number.isFinite(empties) || empties < 1 || empties > 9) {
          throw new Error(`Invalid empty count "${ch}" at row ${rowIdx + 1}`)
        }

        cellIndex += empties
        filledInRow += empties
        i += 1
        continue
      }

      let promoted = false
      let pieceChar = ch

      if (pieceChar === '+') {
        promoted = true
        i += 1
        pieceChar = charAtOrThrow(row, i, `Invalid promoted piece token at row ${rowIdx + 1}`)
      }

      const isSente = pieceChar === pieceChar.toUpperCase()
      const owner: PlayerOwner = isSente ? 'self' : 'opponent'

      const upper = pieceChar.toUpperCase()
      const key = `${promoted ? '+' : ''}${upper}`
      const mapped = SFEN_PIECE_MAP[key]
      if (!mapped) {
        throw new Error(
          `Unknown SFEN piece token "${promoted ? '+' : ''}${pieceChar}" at row ${rowIdx + 1}`,
        )
      }

      const piece = ShogiPieceFactory.create(mapped.type, owner)
      if (mapped.promoted) piece.promote()

      boardState.set(cellIndex, piece)

      cellIndex += 1
      filledInRow += 1
      i += 1
    }

    if (filledInRow !== BOARD_SIZE) {
      throw new Error(`Invalid SFEN row width at row ${rowIdx + 1}: expected 9, got ${filledInRow}`)
    }
  }

  if (cellIndex !== BOARD_CELLS) {
    throw new Error(`Invalid SFEN board cells: expected 81, got ${cellIndex}`)
  }

  const myKomadai: KomadaiItem[] = []
  const opponentKomadai: KomadaiItem[] = []

  if (handStr !== '-' && handStr.length > 0) {
    let i = 0

    while (i < handStr.length) {
      let count = 1

      let ch = charAtOrThrow(handStr, i, 'Unexpected end in SFEN hands')

      if (isDigitChar(ch)) {
        let numStr = ''
        while (i < handStr.length) {
          const cur = handStr[i]
          if (cur === undefined || !isDigitChar(cur)) break
          numStr += cur
          i += 1
        }

        const parsed = parseInt(numStr, 10)
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error(`Invalid hand count "${numStr}" in SFEN hands`)
        }

        count = parsed
        ch = charAtOrThrow(handStr, i, 'Invalid SFEN hands: missing piece letter after count')
      }

      const isSente = ch === ch.toUpperCase()
      const owner: PlayerOwner = isSente ? 'self' : 'opponent'

      const upper = ch.toUpperCase()
      const mapped = SFEN_PIECE_MAP[upper]
      if (!mapped) {
        throw new Error(`Unknown SFEN hand piece "${ch}"`)
      }
      if (mapped.promoted) {
        throw new Error(`Invalid SFEN hand piece "${ch}": hands cannot contain promoted pieces`)
      }

      const item: KomadaiItem = {
        label: PIECE_LABEL_MAP[mapped.type],
        count,
        type: mapped.type,
      }

      if (owner === 'self') addOrUpdateKomadai(myKomadai, item)
      else addOrUpdateKomadai(opponentKomadai, item)

      i += 1
    }
  }

  const turn: PlayerOwner = turnChar === 'b' ? 'self' : 'opponent'

  return {
    boardState,
    turn,
    myKomadai,
    opponentKomadai,
  }
}

/**
 * Export game state to SFEN string.
 */
export function toSFEN(
  cells: (IShogiPiece | null)[],
  turn: PlayerOwner,
  myKomadai: KomadaiItem[],
  opponentKomadai: KomadaiItem[],
  moveNumber: number = 1,
): string {
  const boardStr = buildBoardString(cells)
  const turnStr = turn === 'self' ? 'b' : 'w'
  const handStr = buildHandString(myKomadai, opponentKomadai)

  return `${boardStr} ${turnStr} ${handStr} ${moveNumber}`
}

function buildBoardString(cells: (IShogiPiece | null)[]): string {
  const rows: string[] = []

  for (let rowIdx = 0; rowIdx < BOARD_SIZE; rowIdx++) {
    let rowStr = ''
    let emptyCount = 0

    for (let colIdx = 0; colIdx < BOARD_SIZE; colIdx++) {
      const cellIndex = rowIdx * BOARD_SIZE + colIdx
      const piece = cells[cellIndex]

      if (!piece) {
        emptyCount++
        continue
      }

      if (emptyCount > 0) {
        rowStr += emptyCount.toString()
        emptyCount = 0
      }

      rowStr += pieceToSfenChar(piece)
    }

    if (emptyCount > 0) {
      rowStr += emptyCount.toString()
    }

    rows.push(rowStr)
  }

  return rows.join('/')
}

function pieceToSfenChar(piece: IShogiPiece): string {
  const baseChar = PIECE_TYPE_TO_SFEN[piece.type]
  const char = piece.owner === 'self' ? baseChar : baseChar.toLowerCase()
  return piece.promoted ? `+${char}` : char
}

function buildHandString(myKomadai: KomadaiItem[], opponentKomadai: KomadaiItem[]): string {
  const parts: string[] = []

  const handOrder: PieceType[] = ['Rook', 'Bishop', 'Gold', 'Silver', 'Knight', 'Lance', 'Pawn']

  for (const type of handOrder) {
    const item = myKomadai.find((k) => k.type === type)
    if (item && item.count > 0) {
      const char = PIECE_TYPE_TO_SFEN[type]
      parts.push(item.count > 1 ? `${item.count}${char}` : char)
    }
  }

  for (const type of handOrder) {
    const item = opponentKomadai.find((k) => k.type === type)
    if (item && item.count > 0) {
      const char = PIECE_TYPE_TO_SFEN[type].toLowerCase()
      parts.push(item.count > 1 ? `${item.count}${char}` : char)
    }
  }

  return parts.length > 0 ? parts.join('') : '-'
}

function addOrUpdateKomadai(list: KomadaiItem[], item: KomadaiItem): void {
  const existing = list.find((k) => k.type === item.type)
  if (existing) {
    existing.count += item.count
    return
  }
  list.push({ ...item })
}

/**
 * Converts a USI move into a full USI move prefixed with the moving piece letter,
 * using the given SFEN to locate the moving piece.
 *
 * Examples:
 * - "7g7f" -> "P7g7f"
 * - "8h7g" -> "B8h7g"
 * - "P*5e" -> "P*5e" (already includes piece)
 */
export function toFullUsiMove(usi: string, sfen: string): string {
  const trimmed = usi.trim()
  if (!trimmed) return trimmed
  if (trimmed.includes('*')) return trimmed
  if (trimmed.length < 4) return trimmed

  const from = trimmed.slice(0, 2)
  const fileChar = from[0]
  const rankChar = from[1]
  if (!fileChar || !rankChar) return trimmed

  const file = Number.parseInt(fileChar, 10)
  if (!Number.isFinite(file) || file < 1 || file > 9) return trimmed

  const rankCode = rankChar.charCodeAt(0)
  if (rankCode < USI_RANK_A_CODE || rankCode > USI_RANK_I_CODE) return trimmed

  const x = 9 - file
  const y = rankCode - USI_RANK_A_CODE
  const index = y * BOARD_SIZE + x

  try {
    const parsed = parseSFEN(sfen)
    const piece = parsed.boardState.get(index)
    if (!piece) return trimmed

    const pieceLetter = PIECE_TYPE_TO_SFEN[piece.type]
    if (!pieceLetter) return trimmed

    return `${pieceLetter}${trimmed}`
  } catch {
    return trimmed
  }
}
