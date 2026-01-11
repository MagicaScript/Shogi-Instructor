export type PlayerColor = 'sente' | 'gote'

export type GameInfo = {
  sfen: string
  player: { color: PlayerColor }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function isPlayerColor(v: unknown): v is PlayerColor {
  return v === 'sente' || v === 'gote'
}

export function isGameInfo(v: unknown): v is GameInfo {
  if (!isObject(v)) return false
  if (typeof v.sfen !== 'string' || v.sfen.trim().length === 0) return false
  if (!isObject(v.player)) return false
  if (!isPlayerColor(v.player.color)) return false
  return true
}

export function oppositeColor(color: PlayerColor): PlayerColor {
  return color === 'sente' ? 'gote' : 'sente'
}

export function getSideToMoveFromSfen(sfen: string): PlayerColor | null {
  const parts = sfen.trim().split(/\s+/)
  const turn = parts[1]
  if (turn === 'b') return 'sente'
  if (turn === 'w') return 'gote'
  return null
}
