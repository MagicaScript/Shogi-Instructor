/* src/logic/geminiService.ts */

import { settingsStore, type CoachProfile, type TextLanguage } from '@/schemes/settings'
import type { EngineAnalysisPayload } from '@/schemes/engineAnalysis'
import type { Score } from '@/schemes/usi'
import { isObject } from '@/utils/typeGuards'
import type { MoveQuality } from '@/schemes/moveHistory'
import { moveQualityLabel } from '@/logic/moveQuality'

export type GeminiEmotion = 'happy' | 'neutral' | 'concerned' | 'excited'

export type GeminiCoachResponse = {
  text: string
  audioText: string
  emotion: GeminiEmotion
}

export type GeminiCoachContext = {
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
  board?: GeminiBoardContext
}

export type GeminiBoardContext = {
  playerColor?: string
  lastRoundMove?: string
  sideLastMove?: string
  sideToMove?: string
  positionText?: string
  isUndo?: boolean
  /** True when only one legal move exists (forced response to check). */
  isOnlyMove?: boolean
  /** Quality assessment of the last move (best, good, inaccuracy, mistake, blunder, forced, unknown). */
  lastMoveQuality?: MoveQuality
}

function isGeminiEmotion(v: unknown): v is GeminiEmotion {
  return v === 'happy' || v === 'neutral' || v === 'concerned' || v === 'excited'
}

function isGeminiCoachResponse(v: unknown): v is GeminiCoachResponse {
  if (!isObject(v)) return false
  return (
    typeof v.text === 'string' &&
    v.text.trim().length > 0 &&
    typeof v.audioText === 'string' &&
    v.audioText.trim().length > 0 &&
    isGeminiEmotion(v.emotion)
  )
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
  if (abs < 80) ctx = 'slight edge'
  else if (abs < 200) ctx = 'clear advantage'
  else if (abs < 500) ctx = 'large advantage'
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

function buildPrompt(ctx: GeminiCoachContext): string {
  const s = ctx.settings
  const e = ctx.engine
  const b = ctx.board

  const scoreInfo = scoreToEvalContext(e.score)
  const targetWordCount = randomIntInclusive(5, 30)

  const lines: string[] = []
  lines.push('TASK:')
  lines.push('    You are teaching Shogi to the user by playing a teaching game WITH them.')
  lines.push(
    '    Speak in first person as the coach character ("I"). You are not a third-party observer.',
  )
  lines.push('    Act like a Coach with personality.')
  lines.push('')
  lines.push('STYLE:')
  lines.push(
    '    When communicating, naturally select vivid alternatives to overused phrases and avoid repetitive wording.',
  )
  lines.push(
    '    You MAY use mild profanity naturally if it fits the coach personality and language, but Avoid sexual/hate speech.',
  )
  lines.push('')
  lines.push('CONTEXT:')

  lines.push(`    - Coach Name: "${ctx.coach.name}"`)
  if (ctx.coach.personalityPrompt.trim().length > 0) {
    lines.push(`    - Coach Personality: "${ctx.coach.personalityPrompt.trim()}"`)
  }

  if (e.sfen.trim().length > 0) lines.push(`    - sfen: "${e.sfen.trim()}"`)
  if (b?.playerColor) lines.push(`    - Player side: "${b.playerColor}"`)
  if (b?.lastRoundMove) lines.push(`    - Last round Move: "${b.lastRoundMove}"`)
  if (b?.sideLastMove) lines.push(`    - Side Last Move: "${b.sideLastMove}"`)
  if (b?.sideToMove) lines.push(`    - Side To Move: "${b.sideToMove}"`)

  if (scoreInfo) {
    lines.push(`    - Eval: ${scoreInfo.evalScoreText} (cp) -> ${scoreInfo.evalContext}`)
  }

  if (e.bestmove) lines.push(`    - Best Move: ${e.bestmove}`)
  if (e.ponder) lines.push(`    - Ponder: ${e.ponder}`)

  if (e.pv && e.pv.length > 0) lines.push(`    - PV: ${e.pv.join(' ')}`)

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

  // Add move quality information
  if (b?.lastMoveQuality && b.lastMoveQuality !== 'unknown') {
    const qualityLabel = moveQualityLabel(b.lastMoveQuality)
    lines.push(`    - Quality of Last Move: ${qualityLabel}`)

    // Add contextual guidance based on move quality
    switch (b.lastMoveQuality) {
      case 'best':
        lines.push(
          '    - The last move was the engine-recommended best move. Acknowledge the good play.',
        )
        break
      case 'good':
        lines.push('    - The last move was solid, close to best. Briefly affirm.')
        break
      case 'inaccuracy':
        lines.push('    - The last move was slightly inaccurate. Gently suggest improvement.')
        break
      case 'mistake':
        lines.push(
          '    - The last move was a mistake. Explain what went wrong without being harsh.',
        )
        break
      case 'blunder':
        lines.push(
          '    - The last move was a serious blunder. Highlight the error clearly but constructively.',
        )
        break
      case 'forced':
        lines.push(
          '    - The last move was forced (only legal option). No need to evaluate quality.',
        )
        break
    }
  }

  lines.push('')
  lines.push('GUIDELINES:')
  lines.push('    1. Do NOT state any numeric evaluation score or specific move.')
  lines.push(
    '    2. Focus on the meaning of the last move (defense, attack, shape) and one concrete next idea.',
  )
  lines.push(`    3. Keep it concise: 1–2 sentences, about ${targetWordCount} words.`)
  lines.push('')
  lines.push('OUTPUT:')
  lines.push(`    - Write in: ${s.textLanguage}`)
  lines.push('    - Return only natural language.')
  lines.push('    - No JSON, no markdown, no code block, no thought process.')

  return lines.join('\n')
}

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
  error?: { message?: string }
}

function isGeminiGenerateResponse(v: unknown): v is GeminiGenerateResponse {
  return isObject(v)
}

function extractCandidateText(json: GeminiGenerateResponse): string {
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

export async function requestGeminiCoach(ctx: GeminiCoachContext): Promise<GeminiCoachResponse> {
  const apiKey = settingsStore.getGeminiApiKey()
  if (!apiKey) throw new Error('Missing Gemini API key (cookies).')

  const state = settingsStore.getState()
  const baseUrl = state.geminiBaseUrl.trim()
  const modelName = state.geminiModelName.trim()
  if (baseUrl.length === 0) throw new Error('Missing Gemini Base URL.')
  if (modelName.length === 0) throw new Error('Missing Gemini Model Name.')

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
      isGeminiGenerateResponse(json) && json.error && typeof json.error.message === 'string'
        ? json.error.message
        : `Gemini HTTP ${res.status}`
    throw new Error(msg)
  }

  if (!isGeminiGenerateResponse(json)) throw new Error('Invalid Gemini response.')

  const rawText = extractCandidateText(json)
  if (rawText.trim().length === 0) throw new Error('Gemini returned empty text.')

  const maybeJson = tryParseJsonObject(rawText)
  if (maybeJson && isGeminiCoachResponse(maybeJson)) return maybeJson

  const text = rawText.trim()
  const audioText = text.trim()

  if (text.length === 0 || audioText.length === 0) throw new Error('Gemini returned empty text.')

  return { text, audioText, emotion: 'neutral' }
}

export function makeContextFromAnalysis(
  analysis: EngineAnalysisPayload,
  coach: CoachProfile,
  settings: { textLanguage: TextLanguage; audioLanguage: TextLanguage },
  board?: GeminiBoardContext,
): GeminiCoachContext {
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
