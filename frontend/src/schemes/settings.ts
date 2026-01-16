/* src/schemes/settings.ts */

import {
  YANEURAOU_PARAM_DEFAULTS,
  applyYaneuraOuParamPatch,
  coerceYaneuraOuParam,
  isYaneuraOuParam,
  type YaneuraOuParam,
} from '@/schemes/yaneuraOuParam'
import { isObject } from '@/utils/typeGuards'

export const TEXT_LANGUAGES = ['English', 'Japanese', 'Chinese'] as const
export type TextLanguage = (typeof TEXT_LANGUAGES)[number]

export type CoachProfile = {
  id: string
  name: string
  image: string
  voice: string
  language: TextLanguage
  personalityPrompt: string
}

export type SettingsState = {
  llmBaseUrl: string
  llmModelName: string
  textLanguage: TextLanguage
  audioLanguage: TextLanguage
  coachId: string
  yaneuraOu: YaneuraOuParam
}

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
const DEFAULT_MODEL_NAME = 'gemini-3-flash-preview'
const API_KEY_COOKIE = 'llm_api_key'
const STORAGE_KEY = 'lishogi_botcoach_settings_v1'

const DEFAULT_COACHES: readonly CoachProfile[] = [
  {
    id: 'calm-sensei',
    name: 'Calm Sensei',
    image: '/assets/calm-sensei.jpg',
    voice: 'neutral_male_1',
    language: 'English',
    personalityPrompt:
      'You are calm, precise, and supportive. You teach shogi with short, practical advice and clear priorities.',
  },
  {
    id: 'tactical-trainer',
    name: 'Tactical Trainer',
    image: '/assets/tactical-trainer.jpg',
    voice: 'energetic_male_1',
    language: 'English',
    personalityPrompt:
      'You are energetic and tactical. You highlight threats, forcing lines, and immediate refutations without being rude.',
  },
  {
    id: 'kind-mentor',
    name: 'Kind Mentor',
    image: '/assets/kind-mentor.jpg',
    voice: 'soft_female_1',
    language: 'English',
    personalityPrompt:
      'You are warm and encouraging. You focus on fundamentals, safety, and small improvements each move.',
  },
  {
    id: 'sora-chan',
    name: 'Sora chan',
    image: '/assets/sora-chan.jpg',
    voice: 'Zephyr',
    language: 'English',
    personalityPrompt:
      "You are Sora-chan! An anime magical girl. You always use metaphor for the current position and moves. You are super energetic and cute. End sentences with 'desu' or magical sounds. You sometimes call the player 'Onii-chan' or 'Senpai'.",
  },
]

export function isTextLanguage(v: unknown): v is TextLanguage {
  return typeof v === 'string' && (TEXT_LANGUAGES as readonly string[]).includes(v)
}

export function isCoachProfile(v: unknown): v is CoachProfile {
  if (!isObject(v)) return false
  return (
    typeof v.id === 'string' &&
    v.id.trim().length > 0 &&
    typeof v.name === 'string' &&
    v.name.trim().length > 0 &&
    typeof v.image === 'string' &&
    typeof v.voice === 'string' &&
    isTextLanguage(v.language) &&
    typeof v.personalityPrompt === 'string'
  )
}

export function isSettingsState(v: unknown): v is SettingsState {
  if (!isObject(v)) return false
  return (
    typeof v.llmBaseUrl === 'string' &&
    v.llmBaseUrl.trim().length > 0 &&
    typeof v.llmModelName === 'string' &&
    v.llmModelName.trim().length > 0 &&
    isTextLanguage(v.textLanguage) &&
    isTextLanguage(v.audioLanguage) &&
    typeof v.coachId === 'string' &&
    v.coachId.trim().length > 0 &&
    isYaneuraOuParam(v.yaneuraOu)
  )
}

function canUseDom(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function setCookie(name: string, value: string, days: number): void {
  if (!canUseDom()) return
  const maxAge = Math.max(0, Math.trunc(days * 24 * 60 * 60))
  const encoded = encodeURIComponent(value)
  document.cookie = `${name}=${encoded}; Max-Age=${maxAge}; Path=/; SameSite=Lax; Secure`
}

function getCookie(name: string): string | null {
  if (!canUseDom()) return null
  const target = `${name}=`
  const parts = document.cookie.split(';').map((s) => s.trim())
  for (const p of parts) {
    if (!p.startsWith(target)) continue
    const v = p.slice(target.length)
    try {
      return decodeURIComponent(v)
    } catch {
      return v
    }
  }
  return null
}

function deleteCookie(name: string): void {
  if (!canUseDom()) return
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure`
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function clampString(input: string, maxLen: number): string {
  const s = input.trim()
  return s.length <= maxLen ? s : s.slice(0, maxLen)
}

function makeDefaultState(): SettingsState {
  return {
    llmBaseUrl: DEFAULT_BASE_URL,
    llmModelName: DEFAULT_MODEL_NAME,
    textLanguage: 'English',
    audioLanguage: 'English',
    coachId: DEFAULT_COACHES[0]?.id ?? 'calm-sensei',
    yaneuraOu: { ...YANEURAOU_PARAM_DEFAULTS },
  }
}

function coerceSettingsState(raw: unknown): SettingsState {
  const base = makeDefaultState()
  if (!isObject(raw)) return base

  const r = raw as Record<string, unknown>

  const llmBaseUrl =
    typeof r.llmBaseUrl === 'string' && r.llmBaseUrl.trim().length > 0
      ? r.llmBaseUrl.trim()
      : base.llmBaseUrl

  const llmModelName =
    typeof r.llmModelName === 'string' && r.llmModelName.trim().length > 0
      ? r.llmModelName.trim()
      : base.llmModelName

  const textLanguage = isTextLanguage(r.textLanguage) ? r.textLanguage : base.textLanguage
  const audioLanguage = isTextLanguage(r.audioLanguage) ? r.audioLanguage : base.audioLanguage

  const coachId =
    typeof r.coachId === 'string' && r.coachId.trim().length > 0 ? r.coachId.trim() : base.coachId

  const yaneuraOu = coerceYaneuraOuParam(r.yaneuraOu, base.yaneuraOu)

  return { llmBaseUrl, llmModelName, textLanguage, audioLanguage, coachId, yaneuraOu }
}

type Listener = (state: SettingsState) => void

export class SettingsStore {
  private static instance: SettingsStore | null = null
  private state: SettingsState
  private listeners: Set<Listener> = new Set()

  private constructor() {
    this.state = this.loadState()
  }

  static getInstance(): SettingsStore {
    if (!SettingsStore.instance) SettingsStore.instance = new SettingsStore()
    return SettingsStore.instance
  }

  getCoaches(): readonly CoachProfile[] {
    return DEFAULT_COACHES
  }

  getCoachById(id: string): CoachProfile | null {
    const found = DEFAULT_COACHES.find((c) => c.id === id)
    return found ?? null
  }

  getState(): SettingsState {
    return { ...this.state, yaneuraOu: { ...this.state.yaneuraOu } }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.getState())
    return () => {
      this.listeners.delete(listener)
    }
  }

  update(patch: Partial<SettingsState>): void {
    const next: SettingsState = {
      ...this.state,
      ...patch,
      yaneuraOu: patch.yaneuraOu ? { ...patch.yaneuraOu } : this.state.yaneuraOu,
    }
    if (!isSettingsState(next)) return
    this.state = next
    this.persistState()
    this.emit()
  }

  updateYaneuraOu(patch: Partial<YaneuraOuParam>): void {
    const next = applyYaneuraOuParamPatch(this.state.yaneuraOu, patch)
    this.update({ yaneuraOu: next })
  }

  setLLMApiKey(apiKey: string): void {
    const key = clampString(apiKey, 512)
    if (key.length === 0) return
    setCookie(API_KEY_COOKIE, key, 365)
  }

  getLLMApiKey(): string | null {
    const v = getCookie(API_KEY_COOKIE)
    if (!v) return null
    const k = v.trim()
    return k.length > 0 ? k : null
  }

  clearLLMApiKey(): void {
    deleteCookie(API_KEY_COOKIE)
  }

  private emit(): void {
    const snapshot = this.getState()
    for (const fn of this.listeners) fn(snapshot)
  }

  private loadState(): SettingsState {
    if (!canUseDom()) return makeDefaultState()
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return makeDefaultState()
    const json = safeParseJson(raw)
    return coerceSettingsState(json)
  }

  private persistState(): void {
    if (!canUseDom()) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state))
  }
}

export const settingsStore = SettingsStore.getInstance()
export const SETTINGS_DEFAULTS = {
  baseUrl: DEFAULT_BASE_URL,
  modelName: DEFAULT_MODEL_NAME,
  apiKeyCookieName: API_KEY_COOKIE,
}
