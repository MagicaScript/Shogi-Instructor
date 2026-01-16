/* src/logic/llmService.ts */

import { settingsStore, type CoachProfile, type TextLanguage } from '@/schemes/settings'
import type { EngineAnalysisPayload } from '@/schemes/engineAnalysis'
import type { Score } from '@/schemes/usi'
import { isObject } from '@/utils/typeGuards'
import type { MoveQuality } from '@/schemes/moveHistory'
import { moveQualityLabel } from '@/logic/moveQuality'
import { toFullUsiMove } from '@/utils/sfenUtils'

export type LLMEmotion = 'happy' | 'neutral' | 'concerned' | 'excited'

export type LLMCoachResponse = {
  text: string
  audioText: string
  emotion: LLMEmotion
}

export type LLMCoachContext = {
  coach: CoachProfile
  settings: {
    textLanguage: TextLanguage
    audioLanguage: TextLanguage
  }
  engine: {
    sfen: string
    bestmove?: string
    ponder?: string
    score?: Score
    pv?: string[]
  }
  board?: LLMBoardContext
}

export type LLMBoardContext = {
  playerColor?: string
  sideLastMove?: string
  sideToMove?: string
  positionText?: string
  isUndo?: boolean
  /** True when only one legal move exists (forced response to check). */
  isOnlyMove?: boolean
  /** The last move in USI format (e.g. '7g7f', 'P*5e'). Applies to whichever side just moved. */
  lastMove?: string
  /** Quality assessment of the last move (best, good, inaccuracy, mistake, blunder, forced, unknown). */
  lastMoveQuality?: MoveQuality
  /** Eval drop for the last move. Negative = position worsened. */
  lastMoveEvalDrop?: number
  /** Single top hanging piece in "R@5e" format. */
  hangedPiece?: string
}

function isLLMEmotion(v: unknown): v is LLMEmotion {
  return v === 'happy' || v === 'neutral' || v === 'concerned' || v === 'excited'
}

function isLLMCoachResponse(v: unknown): v is LLMCoachResponse {
  if (!isObject(v)) return false
  return (
    typeof v.text === 'string' &&
    v.text.trim().length > 0 &&
    typeof v.audioText === 'string' &&
    v.audioText.trim().length > 0 &&
    isLLMEmotion(v.emotion)
  )
}

function isPlayerSideLastMove(sideLastMove?: string): boolean {
  if (!sideLastMove) return false
  return sideLastMove.toLowerCase().includes('player')
}

function scoreToEvalContext(
  score: Score | undefined,
): { evalScoreText: string; evalContext: string } | null {
  if (!score || score.type === 'none') return null

  if (score.type === 'mate') {
    const v = score.value
    if (v === 'unknown')
      return { evalScoreText: 'mate:unknown', evalContext: 'a mating sequence may exist' }
    const sign = v > 0 ? 'for the side to move' : 'against the side to move'
    return { evalScoreText: `mate:${v}`, evalContext: `a forced mate is indicated (${sign})` }
  }

  const cp = Math.trunc(score.value)
  const abs = Math.abs(cp)

  let ctx = 'approximately equal'
  if (abs < 300) ctx = 'slight edge'
  else if (abs < 800) ctx = 'clear advantage'
  else if (abs < 2000) ctx = 'large advantage'
  else ctx = 'decisive advantage'

  const side = cp > 0 ? 'for the side to move' : 'against the side to move'
  return { evalScoreText: String(cp), evalContext: `${ctx} ${side}` }
}

/** Returns a random integer in the inclusive range [min, max]. */
function randomIntInclusive(min: number, max: number): number {
  const lo = Math.ceil(min)
  const hi = Math.floor(max)
  const range = hi - lo + 1
  if (range <= 0) return lo

  const cryptoObj = globalThis.crypto
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const buf = new Uint32Array(1)
    const maxUint = 0xffffffff
    const limit = maxUint - (maxUint % range)

    for (let i = 0; i < 4; i++) {
      cryptoObj.getRandomValues(buf)
      const v = buf[0] ?? 0
      if (v < limit) return lo + (v % range)
    }

    cryptoObj.getRandomValues(buf)
    return lo + ((buf[0] ?? 0) % range)
  }

  return lo + Math.floor(Math.random() * range)
}

function buildPrompt(ctx: LLMCoachContext): string {
  const s = ctx.settings
  const e = ctx.engine
  const b = ctx.board
  const sfen = e.sfen.trim()

  const bestmoveFull = e.bestmove && sfen.length > 0 ? toFullUsiMove(e.bestmove, sfen) : e.bestmove
  const ponderFull = e.ponder && sfen.length > 0 ? toFullUsiMove(e.ponder, sfen) : e.ponder

  const scoreInfo = scoreToEvalContext(e.score)
  const targetWordCount = randomIntInclusive(5, 30)

  const lines: string[] = []
  lines.push('TASK:')
  lines.push(
    '    You are teaching Shogi by playing a teaching game against player. You are the opponent.',
  )
  lines.push('    Speak in first person ("I"). You are not a third-party observer.')
  lines.push('    Act like a Coach with personality.')
  lines.push('')
  lines.push('STYLE:')
  lines.push(
    '    When communicating, naturally select vivid alternatives to overused phrases and avoid repetitive wording.',
  )
  lines.push(
    '    You MAY use mild profanity naturally if it fits the character personality, but avoid sexual/hate speech.',
  )
  lines.push('')
  lines.push('CONTEXT:')

  lines.push(`    - Coach Name: "${ctx.coach.name}"`)
  if (ctx.coach.personalityPrompt.trim().length > 0) {
    lines.push(`    - Coach Personality: "${ctx.coach.personalityPrompt.trim()}"`)
  }

  if (sfen.length > 0) lines.push(`    - sfen: "${sfen}"`)
  if (b?.playerColor) lines.push(`    - Player side: "${b.playerColor}"`)
  if (b?.sideLastMove) lines.push(`    - Side Last Move: "${b.sideLastMove}"`)
  if (b?.lastMove) lines.push(`    - Last Move: ${b.lastMove}`)

  // Add move quality information
  if (b?.lastMoveQuality && b.lastMoveQuality !== 'unknown') {
    const qualityLabel = moveQualityLabel(b.lastMoveQuality)
    // Append eval drop if available (e.g. "Mistake (-1200)")
    const evalDropSuffix =
      typeof b.lastMoveEvalDrop === 'number'
        ? ` (${b.lastMoveEvalDrop >= 0 ? '+' : ''}${b.lastMoveEvalDrop})`
        : ''
    lines.push(`    - Quality of Last Move: ${qualityLabel}${evalDropSuffix}`)

    // Add contextual guidance based on move quality
    switch (b.lastMoveQuality) {
      case 'best':
        lines.push('    - The last move was the best move. Acknowledge the good play.')
        break
      case 'good':
        lines.push('    - The last move was solid.')
        break
      case 'inaccuracy':
        lines.push('    - The last move was slightly inaccurate.')
        break
      case 'mistake':
        lines.push('    - The last move was a mistake.')
        break
      case 'blunder':
        lines.push('    - The last move was a serious blunder.')
        break
      case 'forced':
        lines.push(
          '    - The last move was forced (only legal option). No need to evaluate quality.',
        )
        break
    }
  }

  if (b?.sideToMove) lines.push(`    - Side To Move: "${b.sideToMove}"`)

  if (scoreInfo) {
    lines.push(`    - Eval: ${scoreInfo.evalScoreText} -> ${scoreInfo.evalContext}`)
  }

  if (!isPlayerSideLastMove(b?.sideLastMove)) {
    if (bestmoveFull) lines.push(`    - Best Move for side to move: ${bestmoveFull}`)
    if (ponderFull) lines.push(`    - Ponder: ${ponderFull}`)

    if (e.pv && e.pv.length > 0) lines.push(`    - PV: ${e.pv.join(' ')}`)
  }

  if (b?.positionText && b.positionText.trim().length > 0) {
    lines.push(`    - ${b.positionText.trim()}`)
  }

  if (b?.isUndo) {
    lines.push(
      '    - The player just took back a move (UNDO). Comment on their hesitation or the correction.',
    )
  }

  if (b?.isOnlyMove) {
    lines.push('    - FORCED MOVE: This is the ONLY legal move (typically responding to check).')
    lines.push('    - No alternative moves.')
  }

  if (b?.hangedPiece && b.hangedPiece.trim().length > 0) {
    lines.push(`    - Hanging piece for side last move: ${b.hangedPiece.trim()}`)
  }

  lines.push('')
  lines.push('GUIDELINES:')
  lines.push('    1. Do NOT state any numeric evaluation score or specific move.')
  lines.push(`    2. Keep it concise: 1–2 sentences, about ${targetWordCount} words.`)
  lines.push('')
  lines.push('OUTPUT:')
  lines.push(`    - Write in: ${s.textLanguage}`)
  lines.push('    - Return only natural language in any condition.')
  lines.push('    - No JSON, no markdown, no code block, no thought process.')

  return lines.join('\n')
}

type LLMGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
  error?: { message?: string }
}

function isLLMGenerateResponse(v: unknown): v is LLMGenerateResponse {
  return isObject(v)
}

function extractCandidateText(json: LLMGenerateResponse): string {
  const parts = json.candidates?.[0]?.content?.parts ?? []
  const texts = parts.map((p) => p.text).filter((t): t is string => typeof t === 'string')
  return texts.join('\n')
}

function tryParseJsonObject(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      return JSON.parse(trimmed) as unknown
    } catch {
      return null
    }
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null

  const slice = trimmed.slice(start, end + 1)
  try {
    return JSON.parse(slice) as unknown
  } catch {
    return null
  }
}

export async function requestLLMCoach(ctx: LLMCoachContext): Promise<LLMCoachResponse> {
  const apiKey = settingsStore.getLLMApiKey()
  if (!apiKey) throw new Error('Missing LLM API key (cookies).')

  const state = settingsStore.getState()
  const baseUrl = state.llmBaseUrl.trim()
  const modelName = state.llmModelName.trim()
  if (baseUrl.length === 0) throw new Error('Missing LLM Base URL.')
  if (modelName.length === 0) throw new Error('Missing LLM Model Name.')

  const prompt = buildPrompt(ctx)
  const url = `${baseUrl}/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1536,
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const json: unknown = await res.json().catch(() => null)

  if (!res.ok) {
    const msg =
      isLLMGenerateResponse(json) && json.error && typeof json.error.message === 'string'
        ? json.error.message
        : `LLM HTTP ${res.status}`
    throw new Error(msg)
  }

  if (!isLLMGenerateResponse(json)) throw new Error('Invalid LLM response.')

  const rawText = extractCandidateText(json)
  if (rawText.trim().length === 0) throw new Error('LLM returned empty text.')

  const maybeJson = tryParseJsonObject(rawText)
  if (maybeJson && isLLMCoachResponse(maybeJson)) return maybeJson

  const text = rawText.trim()
  const audioText = text.trim()

  if (text.length === 0 || audioText.length === 0) throw new Error('LLM returned empty text.')

  return { text, audioText, emotion: 'neutral' }
}

export function makeContextFromAnalysis(
  analysis: EngineAnalysisPayload,
  coach: CoachProfile,
  settings: { textLanguage: TextLanguage; audioLanguage: TextLanguage },
  board?: LLMBoardContext,
): LLMCoachContext {
  return {
    coach,
    settings,
    engine: {
      sfen: analysis.sfen,
      bestmove: analysis.bestmove ?? undefined,
      ponder: analysis.ponder ?? undefined,
      score: analysis.score,
      pv: analysis.pv,
    },
    board,
  }
}
