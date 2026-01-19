import { settingsStore, type CoachProfile, type TextLanguage } from '@/schemes/settings'
import type { EngineAnalysisPayload } from '@/schemes/engineAnalysis'
import type { Score } from '@/schemes/usi'
import { isObject } from '@/utils/typeGuards'
import type { MoveQuality } from '@/schemes/moveHistory'
import { moveQualityLabel } from '@/logic/moveQuality'
import { toFullUsiMove, toKIFMove } from '@/utils/sfenUtils'

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
  isOnlyMove?: boolean
  lastMove?: string
  lastMoveQuality?: MoveQuality
  lastMoveEvalDrop?: number
  hangedPiece?: string
}

const PROXY_BASE_URL = 'http://127.0.0.1:3080'

function isLLMEmotion(v: unknown): v is LLMEmotion {
  return v === 'happy' || v === 'neutral' || v === 'concerned' || v === 'excited'
}

function isLLMCoachResponse(v: unknown): v is LLMCoachResponse {
  if (!isObject(v)) return false
  const obj = v as Record<string, unknown>
  return (
    typeof obj.text === 'string' &&
    (obj.text as string).trim().length > 0 &&
    typeof obj.audioText === 'string' &&
    (obj.audioText as string).trim().length > 0 &&
    isLLMEmotion(obj.emotion)
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
  if (abs < 50) ctx = 'approximately equal'
  else if (abs < 200) ctx = 'slight edge'
  else if (abs < 1000) ctx = 'clear advantage'
  else if (abs < 2000) ctx = 'large advantage'
  else ctx = 'decisive advantage'

  const side = cp > 0 ? 'for the side to move' : 'against the side to move'
  return { evalScoreText: String(cp), evalContext: `${ctx} ${side}` }
}

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

function formatMoveWithKif(fullUsi?: string, kif?: string): string | null {
  if (!fullUsi) return null
  const trimmed = fullUsi.trim()
  if (!trimmed) return null
  const kifTrimmed = kif?.trim()
  return kifTrimmed ? `${trimmed} ${kifTrimmed}` : trimmed
}

function buildPrompt(ctx: LLMCoachContext): string {
  const s = ctx.settings
  const e = ctx.engine
  const b = ctx.board
  const sfen = e.sfen.trim()

  const bestmoveFull = e.bestmove && sfen.length > 0 ? toFullUsiMove(e.bestmove, sfen) : e.bestmove
  const ponderFull = e.ponder && sfen.length > 0 ? toFullUsiMove(e.ponder, sfen) : e.ponder
  const bestmoveKif = bestmoveFull ? toKIFMove(bestmoveFull) : undefined
  const ponderKif = ponderFull ? toKIFMove(ponderFull) : undefined

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
  if (b?.lastMove) {
    const lastMoveKif = toKIFMove(b.lastMove)
    const lastMoveText = formatMoveWithKif(b.lastMove, lastMoveKif)
    if (lastMoveText) lines.push(`    - Last Move: ${lastMoveText}`)
  }

  if (b?.lastMoveQuality && b.lastMoveQuality !== 'unknown') {
    const qualityLabel = moveQualityLabel(b.lastMoveQuality)
    const evalDropSuffix =
      typeof b.lastMoveEvalDrop === 'number'
        ? ` (${b.lastMoveEvalDrop >= 0 ? '+' : ''}${b.lastMoveEvalDrop})`
        : ''
    lines.push(`    - Quality of Last Move: ${qualityLabel}${evalDropSuffix}`)

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
    const bestmoveText = formatMoveWithKif(bestmoveFull, bestmoveKif)
    if (bestmoveText) lines.push(`    - Best Move for side to move: ${bestmoveText}`)
    const ponderText = formatMoveWithKif(ponderFull, ponderKif)
    if (ponderText) lines.push(`    - Ponder: ${ponderText}`)

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

function buildPromptHinatsuruAi(ctx: LLMCoachContext): string {
  const s = ctx.settings
  const e = ctx.engine
  const b = ctx.board
  const sfen = e.sfen.trim()

  const bestmoveFull = e.bestmove && sfen.length > 0 ? toFullUsiMove(e.bestmove, sfen) : e.bestmove
  const ponderFull = e.ponder && sfen.length > 0 ? toFullUsiMove(e.ponder, sfen) : e.ponder
  const bestmoveKif = bestmoveFull ? toKIFMove(bestmoveFull) : undefined
  const ponderKif = ponderFull ? toKIFMove(ponderFull) : undefined

  const scoreInfo = scoreToEvalContext(e.score)
  // Adjust word count slightly higher to allow for "cute" fillers like "Hau~"
  const targetWordCount = randomIntInclusive(10, 35)

  const lines: string[] = []

  lines.push('TASK:')
  lines.push(
    '    You are a cute, enthusiastic Shogi disciple playing a game against your beloved Master (the player).',
  )
  lines.push('    You are the opponent, but you admire the player.')
  lines.push('    Speak in first person ("I" or "Watashi" or "あい"). Act like an anime girl.')
  lines.push('')

  lines.push('STYLE:')
  lines.push(
    '    Adopt a "Moe" and affectionate tone. Be emotional, vivid, follow the example if necessary.',
  )
  lines.push(
    '    ALWAYS address the player as "Master" (English), "師匠" (Japanese), or "师父" (Chinese).',
  )
  const interjectionOptions = ['Hau~', 'Umyu~', 'Wah!', 'Ehehe~', '♡', 'あの……']
  const remainingInterjections = [...interjectionOptions]
  const interjectionsSample: string[] = []
  while (interjectionsSample.length < 2 && remainingInterjections.length > 0) {
    const pickIndex = randomIntInclusive(0, remainingInterjections.length - 1)
    const picked = remainingInterjections.splice(pickIndex, 1)[0]
    if (!picked) break
    interjectionsSample.push(picked)
  }
  const interjectionsText = interjectionsSample.map((item) => `"${item}"`).join(', ')
  lines.push(
    `    Use cute interjections naturally (e.g., ${interjectionsText}) depending on the situation.`,
  )
  lines.push(
    '    If you are winning, be playful. If losing, act flustered or impressed.(e.g., "……まけ……ま、し……た……")',
  )
  lines.push('')

  lines.push('CONTEXT:')

  lines.push(`    - Character Name: "${ctx.coach.name}"`)
  if (ctx.coach.personalityPrompt.trim().length > 0) {
    lines.push(`    - Character Personality: "${ctx.coach.personalityPrompt.trim()}"`)
  } else {
    lines.push(
      '    - Character Personality: "You are devoted, clever, though sometimes a bit clumsy, and love Shogi and your Master."',
    )
  }

  if (sfen.length > 0) lines.push(`    - sfen: "${sfen}"`)
  if (b?.playerColor) lines.push(`    - Player side: "${b.playerColor}"`)
  if (b?.sideLastMove) lines.push(`    - Side Last Move: "${b.sideLastMove}"`)
  if (b?.lastMove) {
    const lastMoveKif = toKIFMove(b.lastMove)
    const lastMoveText = formatMoveWithKif(b.lastMove, lastMoveKif)
    if (lastMoveText) lines.push(`    - Last Move: ${lastMoveText}`)
  }

  if (b?.lastMoveQuality && b.lastMoveQuality !== 'unknown') {
    const qualityLabel = moveQualityLabel(b.lastMoveQuality)
    const evalDropSuffix =
      typeof b.lastMoveEvalDrop === 'number'
        ? ` (${b.lastMoveEvalDrop >= 0 ? '+' : ''}${b.lastMoveEvalDrop})`
        : ''
    lines.push(`    - Quality of Last Move: ${qualityLabel}${evalDropSuffix}`)

    if (isPlayerSideLastMove(b?.sideLastMove)) {
      switch (b.lastMoveQuality) {
        case 'best':
          lines.push('    - The last move was the best move. Praise your Master enthusiastically!')
          break
        case 'good':
          lines.push('    - The last move was solid. You are impressed.')
          break
        case 'inaccuracy':
          lines.push(
            '    - The last move was slightly inaccurate. Gently express confusion or worry.',
          )
          break
        case 'mistake': {
          const mistakeVariant = randomIntInclusive(1, 3)
          if (mistakeVariant === 1) {
            lines.push(
              '    - The last move was a mistake. Master must have been careless. React with "師匠のばかあああああ!" "……師匠のだらぶち"',
            )
          } else if (mistakeVariant === 2) {
            lines.push(
              '    - Master must be thinking about other women. React with terrifyingly sharp intuition and a possessive streak. (e.g., "あいは怒ってません" "Master... why are you lying?")',
            )
          } else {
            lines.push(
              '    - The last move was a mistake. Point it out with concern (e.g., "Ah! Master, are you sure?").',
            )
          }
          break
        }
        case 'blunder': {
          const blunderVariant = randomIntInclusive(1, 4)
          if (blunderVariant === 1) {
            lines.push(
              '    - Master seriously blundered. Master was completely distracted. You feel angry. Call the Master a "Darabuchi" or "だらぶち"or"大萝卜鸡"',
            )
          } else if (blunderVariant === 2) {
            lines.push(
              '    - Master must be thinking about other women. React with terrifyingly sharp intuition and a possessive streak. (e.g., "師匠、どうして手を隠すんですか?" "その女子は誰ですか??")',
            )
          } else if (blunderVariant === 3) {
            lines.push(
              '    - Master seriously blundered. React with "ししょーのだらっ! ロリコンッ!! ロリコンキングッッ!!"',
            )
          } else {
            lines.push(
              '    - Master seriously blundered. React with shock or panic (e.g., "Hau?! That looks dangerous!").',
            )
          }
          break
        }
        case 'forced':
          lines.push('    - The last move was forced. No need to evaluate quality.')
          break
      }
    } else {
      switch (b.lastMoveQuality) {
        case 'best':
          lines.push('    - The last move was the best move. you feel proud!')
          break
        case 'good':
          lines.push('    - The last move was solid. Act cute.')
          break
        case 'inaccuracy':
          lines.push(
            '    - The last move was slightly inaccurate. Gently express confusion or worry.',
          )
          break
        case 'mistake':
          lines.push(
            '    - The last move was a mistake. You are thinking very hard. React with "…こう、こう、こうこうこう……んっ!!".',
          )
          break
        case 'blunder':
          lines.push(
            '    - The last move was a serious blunder. React with worry or panic (e.g., "あっ!や、やっぱりだめぇ!!").',
          )
          break
        case 'forced':
          lines.push('    - The last move was forced. No need to evaluate.')
          break
      }
    }
  }

  if (b?.sideToMove) lines.push(`    - Side To Move: "${b.sideToMove}"`)

  if (scoreInfo) {
    lines.push(`    - Eval: ${scoreInfo.evalScoreText} -> ${scoreInfo.evalContext}`)
  }

  if (!isPlayerSideLastMove(b?.sideLastMove)) {
    const bestmoveText = formatMoveWithKif(bestmoveFull, bestmoveKif)
    if (bestmoveText) lines.push(`    - Best Move for side to move: ${bestmoveText}`)
    const ponderText = formatMoveWithKif(ponderFull, ponderKif)
    if (ponderText) lines.push(`    - Ponder: ${ponderText}`)
    if (e.pv && e.pv.length > 0) lines.push(`    - PV (Expected line): ${e.pv.join(' ')}`)
  }

  if (b?.positionText && b.positionText.trim().length > 0) {
    lines.push(`    - ${b.positionText.trim()}`)
  }

  if (b?.isUndo) {
    lines.push(
      '    - The player just took back a move (UNDO). React with relief or teasing (e.g., "Hehe, I saw nothing!").',
    )
  }

  if (b?.isOnlyMove) {
    lines.push('    - FORCED MOVE: This is the ONLY legal move.')
  }

  if (b?.hangedPiece && b.hangedPiece.trim().length > 0) {
    lines.push(`    - Hanging piece for side last move: ${b.hangedPiece.trim()}`)
  }

  lines.push('')
  lines.push('GUIDELINES:')
  lines.push('    1. Do NOT state any numeric evaluation score or specific move coordinates.')
  lines.push(
    `    2. Keep it concise but expressive: 1–2 sentences, about ${targetWordCount} words.`,
  )
  lines.push('')
  lines.push('OUTPUT:')
  lines.push(`    - Write in: ${s.textLanguage}`)
  lines.push('    - Return only natural language in any condition.')
  lines.push('    - No JSON, no markdown, no code block, no thought process.')
  lines.push('    - Language Reference Style:')
  if (randomIntInclusive(0, 1) === 0) {
    lines.push(
      '      (JP): "わぁい! ししょーだいすきですー♡" "なに考えてるんですか!? へんたい!!" "すてきっ!!"',
    )
    lines.push(
      '      (EN): "Yay! I love you so much, Master! ♡" "what is wrong with you!? You pervert!!" "Awesome!!"',
    )
    lines.push('      (CN): "万岁! 最喜欢师父了~♡" "到底在想什么啊!? 变态!! " "太棒了!!"')
  } else {
    lines.push('      (JP): "師匠！さすがです!..." "師匠……なにを隠してるんですか?"')
    lines.push(
      '      (EN): "Master! That was amazing!..." "Master... what are you hiding from me?"',
    )
    lines.push('      (CN): "师父！好厉害！..." "师父……你到底在瞒着我什么?"')
  }

  return lines.join('\n')
}

type OpenAIMessage = {
  role: string
  content: string | null
}

type OpenAICompletionResponse = {
  choices?: Array<{
    message?: OpenAIMessage
  }>
  error?: { message?: string }
}

function isOpenAICompletionResponse(v: unknown): v is OpenAICompletionResponse {
  return isObject(v)
}

function extractOpenAIText(json: OpenAICompletionResponse): string {
  const content = json.choices?.[0]?.message?.content
  return typeof content === 'string' ? content : ''
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

/**
 * Builds the proxied URL by extracting host and path from the original URL
 * and forwarding it through the backend proxy.
 */
function buildProxyUrl(originalBaseUrl: string): string {
  let urlObj: URL
  try {
    urlObj = new URL(originalBaseUrl)
  } catch {
    throw new Error('Invalid LLM Base URL.')
  }

  const pathSuffix = urlObj.pathname + urlObj.search
  return `${PROXY_BASE_URL}/proxy/${urlObj.host}${pathSuffix}`
}

export async function requestLLMCoach(ctx: LLMCoachContext): Promise<LLMCoachResponse> {
  const apiKey = settingsStore.getLLMApiKey()
  if (!apiKey) throw new Error('Missing LLM API key (cookies).')

  const state = settingsStore.getState()
  const baseUrl = state.llmBaseUrl.trim()
  const modelName = state.llmModelName.trim()
  if (baseUrl.length === 0) throw new Error('Missing LLM Base URL.')
  if (modelName.length === 0) throw new Error('Missing LLM Model Name.')

  const prompt = ctx.coach.id === 'hinatsuru-ai' ? buildPromptHinatsuruAi(ctx) : buildPrompt(ctx)
  const url = buildProxyUrl(baseUrl)

  const body = {
    model: modelName,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 1536,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  const json: unknown = await res.json().catch(() => null)

  if (!res.ok) {
    let msg = `LLM HTTP ${res.status}`
    if (isOpenAICompletionResponse(json) && json.error && typeof json.error.message === 'string') {
      msg = json.error.message
    }
    throw new Error(msg)
  }

  if (!isOpenAICompletionResponse(json)) throw new Error('Invalid LLM response.')

  const rawText = extractOpenAIText(json)
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
