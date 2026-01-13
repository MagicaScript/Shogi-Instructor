import { isObject } from '@/utils/typeGuards'

export type CoachPhraseTemplate = {
  text: string | string[]
}

export type SfenTemplateMap = Record<string, CoachPhraseTemplate>

function isTemplateValue(v: unknown): v is CoachPhraseTemplate {
  if (!isObject(v)) return false
  const t = v.text
  if (typeof t === 'string') return t.trim().length > 0
  if (Array.isArray(t))
    return t.length > 0 && t.every((x) => typeof x === 'string' && x.trim().length > 0)
  return false
}

export function isSfenTemplateMap(v: unknown): v is SfenTemplateMap {
  if (!isObject(v)) return false
  for (const [k, val] of Object.entries(v)) {
    if (typeof k !== 'string' || k.trim().length === 0) return false
    if (!isTemplateValue(val)) return false
  }
  return true
}
