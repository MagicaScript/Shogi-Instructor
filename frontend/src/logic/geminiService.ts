/* src/logic/geminiService.ts */

import { settingsStore, type CoachProfile, type TextLanguage } from '@/schemes/settings'
import type { EngineAnalysisPayload } from '@/schemes/engineAnalysis'
import type { UsiScore } from '@/schemes/usi'

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
    score?: UsiScore
    pv?: string[]
  }
  board?: {
    lastRoundMove?: string
    sideLastMove?: string
    sideToMove?: string
    positionText?: string
    isUndo?: boolean
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
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
  score: UsiScore | undefined,
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

function buildPrompt(ctx: GeminiCoachContext): string {
  const s = ctx.settings
  const e = ctx.engine
  const b = ctx.board

  const scoreInfo = scoreToEvalContext(e.score)

  const lines: string[] = []
  lines.push('TASK:')
  lines.push('    You are teaching Shogi to the user. You are observing the board.')
  lines.push('    Do NOT act like a spectator cheering for a side against an "AI".')
  lines.push(
    '    Act like a Mentor or Coach analyzing the moves objectively but with your specific personality.',
  )
  lines.push('    Treat the opponent\'s moves as "problems" the user needs to solve.')
  lines.push('')
  lines.push('CONTEXT:')

  lines.push(`    - Coach Name: "${ctx.coach.name}"`)
  if (ctx.coach.personalityPrompt.trim().length > 0) {
    lines.push(`    - Coach Personality: "${ctx.coach.personalityPrompt.trim()}"`)
  }

  if (e.sfen.trim().length > 0) lines.push(`    - sfen: "${e.sfen.trim()}"`)
  if (b?.lastRoundMove) lines.push(`    - Last round Move: "${b.lastRoundMove}"`)
  if (b?.sideLastMove) lines.push(`    - Side Last Move: "${b.sideLastMove}"`)
  if (b?.sideToMove) lines.push(`    - Side To Move: "${b.sideToMove}"`)

  if (scoreInfo) {
    lines.push(`    - Engine Eval: ${scoreInfo.evalScoreText} (cp) -> ${scoreInfo.evalContext}`)
  }

  if (e.bestmove) lines.push(`    - Engine Recommended Best Move: ${e.bestmove}`)
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

  lines.push('')
  lines.push('GUIDELINES:')
  lines.push('    1. Do NOT state any numeric evaluation score.')
  lines.push('    2. Focus on the meaning of the last move (defense, attack, shape).')
  lines.push('    3. Keep it concise (under 30 words).')
  lines.push('    4. Speak directly to the user.')
  lines.push('')
  lines.push('OUTPUT:')
  lines.push(`    - Write in: ${s.textLanguage}`)
  lines.push('    - Return only the coaching sentence.')
  lines.push('    - No JSON, no markdown, no quotes, no code block.')

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
      maxOutputTokens: 1000,
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
  board?: GeminiCoachContext['board'],
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
