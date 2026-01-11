/* src/schemes/YaneuraOuParam.ts */

export const ENTERING_KING_RULES = [
  'NoEnteringKing',
  'CSARule24',
  'CSARule24H',
  'CSARule27',
  'CSARule27H',
  'TryRule',
] as const
export type EnteringKingRule = (typeof ENTERING_KING_RULES)[number]

export const BOOK_FILES = [
  'no_book',
  'standard_book.db',
  'yaneura_book1.db',
  'yaneura_book2.db',
  'yaneura_book3.db',
  'yaneura_book4.db',
  'user_book1.db',
  'user_book2.db',
  'user_book3.db',
  'book.bin',
] as const
export type BookFile = (typeof BOOK_FILES)[number]

export type YaneuraOuParam = {
  Threads: number
  USI_Hash: number
  USI_Ponder: boolean
  Stochastic_Ponder: boolean
  MultiPV: number
  NetworkDelay: number
  NetworkDelay2: number
  MinimumThinkingTime: number
  SlowMover: number
  MaxMovesToDraw: number
  DepthLimit: number
  NodesLimit: string
  EvalDir: string
  WriteDebugLog: string
  GenerateAllLegalMoves: boolean
  EnteringKingRule: EnteringKingRule
  USI_OwnBook: boolean
  NarrowBook: boolean
  BookMoves: number
  BookIgnoreRate: number
  BookFile: BookFile
  BookDir: string
  BookEvalDiff: number
  BookEvalBlackLimit: number
  BookEvalWhiteLimit: number
  BookDepthLimit: number
  BookOnTheFly: boolean
  ConsiderBookMoveCount: boolean
  BookPvMoves: number
  IgnoreBookPly: boolean
  FlippedBook: boolean
  DrawValueBlack: number
  DrawValueWhite: number
  PvInterval: number
  ResignValue: number
  ConsiderationMode: boolean
  OutputFailLHPV: boolean
}

export const YANEURAOU_PARAM_DEFAULTS: YaneuraOuParam = {
  Threads: 4,
  USI_Hash: 2048,
  USI_Ponder: false,
  Stochastic_Ponder: false,
  MultiPV: 2,
  NetworkDelay: 120,
  NetworkDelay2: 1120,
  MinimumThinkingTime: 2000,
  SlowMover: 100,
  MaxMovesToDraw: 0,
  DepthLimit: 0,
  NodesLimit: '0',
  EvalDir: '.',
  WriteDebugLog: '',
  GenerateAllLegalMoves: false,
  EnteringKingRule: 'CSARule27',
  USI_OwnBook: true,
  NarrowBook: false,
  BookMoves: 16,
  BookIgnoreRate: 0,
  BookFile: 'no_book',
  BookDir: '.',
  BookEvalDiff: 30,
  BookEvalBlackLimit: 0,
  BookEvalWhiteLimit: -140,
  BookDepthLimit: 16,
  BookOnTheFly: false,
  ConsiderBookMoveCount: false,
  BookPvMoves: 8,
  IgnoreBookPly: false,
  FlippedBook: true,
  DrawValueBlack: -2,
  DrawValueWhite: -2,
  PvInterval: 300,
  ResignValue: 99999,
  ConsiderationMode: true,
  OutputFailLHPV: true,
}

type SpinKind = 'number' | 'bigint'

export type YaneuraOuOptionDef =
  | {
      name: keyof YaneuraOuParam
      type: 'spin'
      spinKind: SpinKind
      default: number | string
      min: number | string
      max: number | string
    }
  | { name: keyof YaneuraOuParam; type: 'check'; default: boolean }
  | { name: keyof YaneuraOuParam; type: 'string'; default: string }
  | {
      name: keyof YaneuraOuParam
      type: 'combo'
      default: string
      vars: readonly string[]
    }

export const YANEURAOU_OPTION_DEFS: readonly YaneuraOuOptionDef[] = [
  { name: 'Threads', type: 'spin', spinKind: 'number', default: 1, min: 1, max: 32 },
  { name: 'USI_Hash', type: 'spin', spinKind: 'number', default: 1024, min: 1, max: 2048 },
  { name: 'USI_Ponder', type: 'check', default: false },
  { name: 'Stochastic_Ponder', type: 'check', default: false },
  { name: 'MultiPV', type: 'spin', spinKind: 'number', default: 1, min: 1, max: 600 },
  { name: 'NetworkDelay', type: 'spin', spinKind: 'number', default: 120, min: 0, max: 10000 },
  { name: 'NetworkDelay2', type: 'spin', spinKind: 'number', default: 1120, min: 0, max: 10000 },
  {
    name: 'MinimumThinkingTime',
    type: 'spin',
    spinKind: 'number',
    default: 2000,
    min: 1000,
    max: 100000,
  },
  { name: 'SlowMover', type: 'spin', spinKind: 'number', default: 100, min: 1, max: 1000 },
  { name: 'MaxMovesToDraw', type: 'spin', spinKind: 'number', default: 0, min: 0, max: 100000 },
  {
    name: 'DepthLimit',
    type: 'spin',
    spinKind: 'number',
    default: 0,
    min: 0,
    max: 2147483647,
  },
  {
    name: 'NodesLimit',
    type: 'spin',
    spinKind: 'bigint',
    default: '0',
    min: '0',
    max: '9223372036854775807',
  },
  { name: 'EvalDir', type: 'string', default: '.' },
  { name: 'WriteDebugLog', type: 'string', default: '' },
  { name: 'GenerateAllLegalMoves', type: 'check', default: false },
  { name: 'EnteringKingRule', type: 'combo', default: 'CSARule27', vars: ENTERING_KING_RULES },
  { name: 'USI_OwnBook', type: 'check', default: true },
  { name: 'NarrowBook', type: 'check', default: false },
  { name: 'BookMoves', type: 'spin', spinKind: 'number', default: 16, min: 0, max: 10000 },
  { name: 'BookIgnoreRate', type: 'spin', spinKind: 'number', default: 0, min: 0, max: 100 },
  { name: 'BookFile', type: 'combo', default: 'no_book', vars: BOOK_FILES },
  { name: 'BookDir', type: 'string', default: '.' },
  { name: 'BookEvalDiff', type: 'spin', spinKind: 'number', default: 30, min: 0, max: 99999 },
  {
    name: 'BookEvalBlackLimit',
    type: 'spin',
    spinKind: 'number',
    default: 0,
    min: -99999,
    max: 99999,
  },
  {
    name: 'BookEvalWhiteLimit',
    type: 'spin',
    spinKind: 'number',
    default: -140,
    min: -99999,
    max: 99999,
  },
  { name: 'BookDepthLimit', type: 'spin', spinKind: 'number', default: 16, min: 0, max: 99999 },
  { name: 'BookOnTheFly', type: 'check', default: false },
  { name: 'ConsiderBookMoveCount', type: 'check', default: false },
  { name: 'BookPvMoves', type: 'spin', spinKind: 'number', default: 8, min: 1, max: 246 },
  { name: 'IgnoreBookPly', type: 'check', default: false },
  { name: 'FlippedBook', type: 'check', default: true },
  {
    name: 'DrawValueBlack',
    type: 'spin',
    spinKind: 'number',
    default: -2,
    min: -30000,
    max: 30000,
  },
  {
    name: 'DrawValueWhite',
    type: 'spin',
    spinKind: 'number',
    default: -2,
    min: -30000,
    max: 30000,
  },
  { name: 'PvInterval', type: 'spin', spinKind: 'number', default: 300, min: 0, max: 100000000 },
  { name: 'ResignValue', type: 'spin', spinKind: 'number', default: 99999, min: 0, max: 99999 },
  { name: 'ConsiderationMode', type: 'check', default: true },
  { name: 'OutputFailLHPV', type: 'check', default: true },
] as const

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isIntegerNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v)
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string'
}

function isIn<T extends readonly string[]>(v: unknown, list: T): v is T[number] {
  return typeof v === 'string' && (list as readonly string[]).includes(v)
}

function parseBigIntString(v: unknown): bigint | null {
  if (typeof v === 'string') {
    const s = v.trim()
    if (!/^\d+$/u.test(s)) return null
    try {
      return BigInt(s)
    } catch {
      return null
    }
  }
  if (typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 0) {
    try {
      return BigInt(v)
    } catch {
      return null
    }
  }
  return null
}

function clampBigInt(x: bigint, min: bigint, max: bigint): bigint {
  if (x < min) return min
  if (x > max) return max
  return x
}

export function isYaneuraOuParam(v: unknown): v is YaneuraOuParam {
  if (!isRecord(v)) return false

  const r = v as Record<string, unknown>
  const nodes = parseBigIntString(r.NodesLimit)
  if (nodes === null) return false

  return (
    isIntegerNumber(r.Threads) &&
    r.Threads >= 1 &&
    r.Threads <= 32 &&
    isIntegerNumber(r.USI_Hash) &&
    r.USI_Hash >= 1 &&
    r.USI_Hash <= 2048 &&
    typeof r.USI_Ponder === 'boolean' &&
    typeof r.Stochastic_Ponder === 'boolean' &&
    isIntegerNumber(r.MultiPV) &&
    r.MultiPV >= 1 &&
    r.MultiPV <= 600 &&
    isIntegerNumber(r.NetworkDelay) &&
    r.NetworkDelay >= 0 &&
    r.NetworkDelay <= 10000 &&
    isIntegerNumber(r.NetworkDelay2) &&
    r.NetworkDelay2 >= 0 &&
    r.NetworkDelay2 <= 10000 &&
    isIntegerNumber(r.MinimumThinkingTime) &&
    r.MinimumThinkingTime >= 1000 &&
    r.MinimumThinkingTime <= 100000 &&
    isIntegerNumber(r.SlowMover) &&
    r.SlowMover >= 1 &&
    r.SlowMover <= 1000 &&
    isIntegerNumber(r.MaxMovesToDraw) &&
    r.MaxMovesToDraw >= 0 &&
    r.MaxMovesToDraw <= 100000 &&
    isIntegerNumber(r.DepthLimit) &&
    r.DepthLimit >= 0 &&
    r.DepthLimit <= 2147483647 &&
    isNonEmptyString(r.EvalDir) &&
    typeof r.WriteDebugLog === 'string' &&
    typeof r.GenerateAllLegalMoves === 'boolean' &&
    isIn(r.EnteringKingRule, ENTERING_KING_RULES) &&
    typeof r.USI_OwnBook === 'boolean' &&
    typeof r.NarrowBook === 'boolean' &&
    isIntegerNumber(r.BookMoves) &&
    r.BookMoves >= 0 &&
    r.BookMoves <= 10000 &&
    isIntegerNumber(r.BookIgnoreRate) &&
    r.BookIgnoreRate >= 0 &&
    r.BookIgnoreRate <= 100 &&
    isIn(r.BookFile, BOOK_FILES) &&
    isNonEmptyString(r.BookDir) &&
    isIntegerNumber(r.BookEvalDiff) &&
    r.BookEvalDiff >= 0 &&
    r.BookEvalDiff <= 99999 &&
    isIntegerNumber(r.BookEvalBlackLimit) &&
    r.BookEvalBlackLimit >= -99999 &&
    r.BookEvalBlackLimit <= 99999 &&
    isIntegerNumber(r.BookEvalWhiteLimit) &&
    r.BookEvalWhiteLimit >= -99999 &&
    r.BookEvalWhiteLimit <= 99999 &&
    isIntegerNumber(r.BookDepthLimit) &&
    r.BookDepthLimit >= 0 &&
    r.BookDepthLimit <= 99999 &&
    typeof r.BookOnTheFly === 'boolean' &&
    typeof r.ConsiderBookMoveCount === 'boolean' &&
    isIntegerNumber(r.BookPvMoves) &&
    r.BookPvMoves >= 1 &&
    r.BookPvMoves <= 246 &&
    typeof r.IgnoreBookPly === 'boolean' &&
    typeof r.FlippedBook === 'boolean' &&
    isIntegerNumber(r.DrawValueBlack) &&
    r.DrawValueBlack >= -30000 &&
    r.DrawValueBlack <= 30000 &&
    isIntegerNumber(r.DrawValueWhite) &&
    r.DrawValueWhite >= -30000 &&
    r.DrawValueWhite <= 30000 &&
    isIntegerNumber(r.PvInterval) &&
    r.PvInterval >= 0 &&
    r.PvInterval <= 100000000 &&
    isIntegerNumber(r.ResignValue) &&
    r.ResignValue >= 0 &&
    r.ResignValue <= 99999 &&
    typeof r.ConsiderationMode === 'boolean' &&
    typeof r.OutputFailLHPV === 'boolean'
  )
}

function coerceByDef(def: YaneuraOuOptionDef, raw: unknown, fallback: unknown): unknown {
  if (def.type === 'check') {
    return typeof raw === 'boolean' ? raw : (fallback as boolean)
  }

  if (def.type === 'string') {
    if (typeof raw !== 'string') return fallback as string
    return raw
  }

  if (def.type === 'combo') {
    if (typeof raw !== 'string') return fallback as string
    return def.vars.includes(raw) ? raw : (fallback as string)
  }

  if (def.type === 'spin') {
    if (def.spinKind === 'number') {
      const min = typeof def.min === 'number' ? def.min : Number(def.min)
      const max = typeof def.max === 'number' ? def.max : Number(def.max)
      const vNum = typeof raw === 'number' ? raw : Number(raw)
      const v = Number.isFinite(vNum) ? Math.trunc(vNum) : (fallback as number)
      return clampInt(v, min, max)
    }

    const minB = BigInt(String(def.min))
    const maxB = BigInt(String(def.max))
    const b = parseBigIntString(raw) ?? parseBigIntString(fallback)
    const clamped = clampBigInt(b ?? 0n, minB, maxB)
    return clamped.toString()
  }

  return fallback
}

export function coerceYaneuraOuParam(
  raw: unknown,
  fallback: YaneuraOuParam = YANEURAOU_PARAM_DEFAULTS,
): YaneuraOuParam {
  if (!isRecord(raw)) return { ...fallback }

  const base: YaneuraOuParam = { ...fallback }
  const r = raw as Record<string, unknown>
  const out: Record<string, unknown> = { ...base }

  for (const def of YANEURAOU_OPTION_DEFS) {
    const key = def.name
    out[key] = coerceByDef(def, r[key as string], base[key])
  }

  return out as YaneuraOuParam
}

export function applyYaneuraOuParamPatch(
  base: YaneuraOuParam,
  patch: Partial<YaneuraOuParam>,
): YaneuraOuParam {
  const merged: Record<string, unknown> = { ...base, ...patch }
  return coerceYaneuraOuParam(merged, base)
}
