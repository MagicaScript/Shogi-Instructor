import type { EngineAnalysisPayload } from '@/schemes/engineAnalysis'
import { normalizeSfen } from '@/schemes/engineAnalysis'
import { scoreToKey } from '@/schemes/usi'
import type { SfenTemplateMap } from '@/schemes/botCoachTemplate'
import { isSfenTemplateMap } from '@/schemes/botCoachTemplate'

type LoadState =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'ready'; map: SfenTemplateMap }
  | { type: 'error'; message: string }

function hashString(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pickText(text: string | string[], seed: string): string {
  if (typeof text === 'string') return text
  const idx = text.length === 0 ? 0 : hashString(seed) % text.length
  return text[idx] ?? ''
}

export function makeStateKey(payload: EngineAnalysisPayload): string {
  const sfen = normalizeSfen(payload.sfen)
  const bestmove = payload.bestmove ?? '-'
  const ponder = payload.ponder ?? '-'
  const score = scoreToKey(payload.score)
  const pv = payload.pv.join(' ').trim()
  return `${sfen}|bm:${bestmove}|pd:${ponder}|sc:${score}|pv:${pv}`
}

function makeFallbackKeys(payload: EngineAnalysisPayload): string[] {
  const sfen = normalizeSfen(payload.sfen)
  const bestmove = payload.bestmove ?? '-'
  const ponder = payload.ponder ?? '-'
  const score = scoreToKey(payload.score)
  const pv = payload.pv.join(' ').trim()

  const keys: string[] = []

  keys.push(`${sfen}|bm:${bestmove}|pd:${ponder}|sc:${score}|pv:${pv}`)
  keys.push(`${sfen}|bm:${bestmove}|pd:${ponder}|sc:${score}|pv:`)
  keys.push(`${sfen}|bm:${bestmove}|pd:-|sc:${score}|pv:`)
  keys.push(`${sfen}|bm:${bestmove}|pd:-|sc:none|pv:`)
  keys.push(`${sfen}|bm:${bestmove}|pd:-|sc:none|pv:*`)
  keys.push(`${sfen}|bm:*|pd:*|sc:${score}|pv:`)
  keys.push(`${sfen}|bm:*|pd:*|sc:none|pv:`)
  keys.push(`${sfen}|bm:*|pd:*|sc:none|pv:*`)

  return keys
}

function resolveFromMap(map: SfenTemplateMap, keys: string[]): string | null {
  for (const k of keys) {
    const v = map[k]
    if (!v) continue
    return pickText(v.text, k)
  }
  return null
}

export class BotCoach {
  private state: LoadState = { type: 'idle' }

  /**
   * Loads public/sfenTemplate.json once and caches it.
   */
  async init(): Promise<void> {
    if (this.state.type === 'loading' || this.state.type === 'ready') return

    this.state = { type: 'loading' }
    try {
      const res = await fetch('/sfenTemplate.json', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Template HTTP ${res.status}`)
      const json: unknown = await res.json()
      if (!isSfenTemplateMap(json)) throw new Error('Invalid template schema')
      this.state = { type: 'ready', map: json }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      this.state = { type: 'error', message: msg }
    }
  }

  getLoadError(): string | null {
    return this.state.type === 'error' ? this.state.message : null
  }

  /**
   * Resolves a coaching phrase for a specific engine snapshot.
   */
  getPhrase(payload: EngineAnalysisPayload | null): string {
    if (!payload) return 'Waiting for analysis...'
    if (!payload.bestmove) return 'Analyzing position...'

    if (this.state.type !== 'ready') {
      if (this.state.type === 'error') return `Template load failed: ${this.state.message}`
      return 'Loading coach templates...'
    }

    const keys = makeFallbackKeys(payload)
    const resolved = resolveFromMap(this.state.map, keys)
    if (resolved) return resolved

    const scoreKey = scoreToKey(payload.score)
    const pvText = payload.pv.length > 0 ? payload.pv.join(' ') : '(no pv)'
    return `Engine suggests ${payload.bestmove} (${scoreKey}). PV: ${pvText}`
  }
}
