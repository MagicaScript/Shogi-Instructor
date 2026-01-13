<script lang="ts">
import { defineComponent } from 'vue'
import type { EngineAnalysisPayload } from '@/schemes/engineAnalysis'
import { isEngineAnalysisPayload } from '@/schemes/engineAnalysis'
import { settingsStore, type CoachProfile, type SettingsState } from '@/schemes/settings'
import {
  makeContextFromAnalysis,
  requestGeminiCoach,
  type GeminiCoachResponse,
} from '@/logic/geminiService'
import { isNonEmptyString } from '@/utils/typeGuards'
import type { MoveQuality } from '@/schemes/moveHistory'
import { isMoveQuality } from '@/schemes/moveHistory'

type Props = {
  analysis: EngineAnalysisPayload | null
  coachId: string
  coachName?: string
  coachImage?: string
  coachVoice?: string
  coachLanguage?: SettingsState['textLanguage']
  personalityPrompt?: string
  playerColor?: string
  lastRoundMove?: string
  sideLastMove?: string
  sideToMove?: string
  positionText?: string
  isUndo?: boolean
  isOnlyMove?: boolean
  lastMoveQuality?: MoveQuality
}

type Data = {
  loading: boolean
  lastError: string
  lastResult: GeminiCoachResponse | null
  unsub: null | (() => void)
  state: SettingsState
}

function mergeCoach(base: CoachProfile | null, p: Props): CoachProfile | null {
  if (!base) return null
  const merged: CoachProfile = { ...base }

  if (isNonEmptyString(p.coachName)) merged.name = p.coachName.trim()
  if (isNonEmptyString(p.coachImage)) merged.image = p.coachImage.trim()
  if (isNonEmptyString(p.coachVoice)) merged.voice = p.coachVoice.trim()
  if (isNonEmptyString(p.personalityPrompt)) merged.personalityPrompt = p.personalityPrompt.trim()

  if (
    p.coachLanguage === 'English' ||
    p.coachLanguage === 'Japanese' ||
    p.coachLanguage === 'Chinese'
  ) {
    merged.language = p.coachLanguage
  }

  return merged
}

export default defineComponent({
  name: 'GeminiService',

  props: {
    analysis: { type: Object as () => Props['analysis'], default: null },
    coachId: { type: String, required: true },
    coachName: { type: String, default: '' },
    coachImage: { type: String, default: '' },
    coachVoice: { type: String, default: '' },
    coachLanguage: { type: String as () => Props['coachLanguage'], default: '' },
    personalityPrompt: { type: String, default: '' },
    playerColor: { type: String, default: '' },
    lastRoundMove: { type: String, default: '' },
    sideLastMove: { type: String, default: '' },
    sideToMove: { type: String, default: '' },
    positionText: { type: String, default: '' },
    isUndo: { type: Boolean, default: false },
    isOnlyMove: { type: Boolean, default: false },
    lastMoveQuality: { type: String as () => MoveQuality, default: 'unknown' },
  },

  emits: {
    result: (v: GeminiCoachResponse) => typeof v === 'object' && v !== null,
    error: (msg: string) => typeof msg === 'string',
    loading: (v: boolean) => typeof v === 'boolean',
  },

  data(): Data {
    return {
      loading: false,
      lastError: '',
      lastResult: null,
      unsub: null,
      state: settingsStore.getState(),
    }
  },

  computed: {
    safeAnalysis(): EngineAnalysisPayload | null {
      const v = this.analysis
      if (!v) return null
      return isEngineAnalysisPayload(v) ? v : null
    },
  },

  watch: {
    safeAnalysis: {
      deep: true,
      handler() {
        void this.tryRequest()
      },
    },
    coachId() {
      void this.tryRequest()
    },
    state: {
      deep: true,
      handler() {
        void this.tryRequest()
      },
    },
  },

  mounted() {
    this.unsub = settingsStore.subscribe((s) => {
      this.state = s
    })
    void this.tryRequest()
  },

  beforeUnmount() {
    if (this.unsub) this.unsub()
  },

  methods: {
    async tryRequest() {
      const analysis = this.safeAnalysis
      if (!analysis) return
      if (!analysis.bestmove) return

      const baseCoach = settingsStore.getCoachById(this.coachId)
      const coach = mergeCoach(baseCoach, this.$props as Props)
      if (!coach) return

      const positionText = (() => {
        const parts: string[] = []
        if (isNonEmptyString(this.playerColor)) {
          const raw = this.playerColor.trim()
          const pretty = raw === 'sente' ? 'Sente' : raw === 'gote' ? 'Gote' : raw
          parts.push(`Player side: ${pretty}`)
        }
        if (isNonEmptyString(this.positionText)) parts.push(this.positionText.trim())
        return parts.length > 0 ? parts.join('; ') : undefined
      })()

      const ctx = makeContextFromAnalysis(
        analysis,
        coach,
        { textLanguage: this.state.textLanguage, audioLanguage: this.state.audioLanguage },
        {
          lastRoundMove: isNonEmptyString(this.lastRoundMove)
            ? this.lastRoundMove.trim()
            : undefined,
          sideLastMove: isNonEmptyString(this.sideLastMove) ? this.sideLastMove.trim() : undefined,
          sideToMove: isNonEmptyString(this.sideToMove) ? this.sideToMove.trim() : undefined,
          positionText,
          isUndo: Boolean(this.isUndo),
          isOnlyMove: this.isOnlyMove || analysis.isOnlyMove,
          lastMoveQuality: isMoveQuality(this.lastMoveQuality) ? this.lastMoveQuality : undefined,
        },
      )

      this.loading = true
      this.lastError = ''
      this.$emit('loading', true)

      try {
        const out = await requestGeminiCoach(ctx)
        this.lastResult = out
        this.$emit('result', out)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        this.lastError = msg
        this.$emit('error', msg)
      } finally {
        this.loading = false
        this.$emit('loading', false)
      }
    },
  },
})
</script>

<template>
  <section class="gemini-service">
    <div class="row">
      <div class="label">Gemini</div>
      <div class="value">
        <span v-if="loading">Generating…</span>
        <span v-else-if="lastError" class="err">{{ lastError }}</span>
        <span v-else-if="lastResult" class="ok">Ready</span>
        <span v-else class="muted">Idle</span>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/design.scss' as *;

.gemini-service {
  display: none;
}
</style>
