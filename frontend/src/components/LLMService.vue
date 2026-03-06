<script lang="ts">
import { defineComponent } from 'vue'
import type { EngineAnalysisPayload } from '@/schemes/engineAnalysis'
import { isEngineAnalysisPayload } from '@/schemes/engineAnalysis'
import { settingsStore, type CoachProfile, type SettingsState } from '@/schemes/settings'
import {
  makeContextFromAnalysis,
  requestLLMCoach,
  isRetryableError,
  LLMHttpError,
  type LLMCoachResponse,
} from '@/logic/llmService'
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
  sideLastMove?: string
  sideToMove?: string
  positionText?: string
  isUndo?: boolean
  isOnlyMove?: boolean
  /** The last move in USI format (e.g. '7g7f', 'P*5e'). */
  lastMove?: string
  lastMoveQuality?: MoveQuality
  /** Eval drop for the last move. Negative = position worsened. */
  lastMoveEvalDrop?: number
  /** Single top hanging piece in "R@5e" format. */
  hangedPiece?: string
}

type RetryingInfo = { httpStatus: number; attempt: number; maxAttempts: number }
type RetryExhaustedInfo = { httpStatus: number; message: string }

const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 2000, 4000]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type Data = {
  loading: boolean
  lastError: string
  lastResult: LLMCoachResponse | null
  unsub: null | (() => void)
  state: SettingsState
  requestSeq: number
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
  name: 'LLMService',

  props: {
    analysis: { type: Object as () => Props['analysis'], default: null },
    coachId: { type: String, required: true },
    coachName: { type: String, default: '' },
    coachImage: { type: String, default: '' },
    coachVoice: { type: String, default: '' },
    coachLanguage: { type: String as () => Props['coachLanguage'], default: '' },
    personalityPrompt: { type: String, default: '' },
    playerColor: { type: String, default: '' },
    sideLastMove: { type: String, default: '' },
    sideToMove: { type: String, default: '' },
    positionText: { type: String, default: '' },
    isUndo: { type: Boolean, default: false },
    isOnlyMove: { type: Boolean, default: false },
    /** The last move in USI format (e.g. '7g7f', 'P*5e'). */
    lastMove: { type: String, default: '' },
    lastMoveQuality: { type: String as () => MoveQuality, default: 'unknown' },
    /** Eval drop for the last move. */
    lastMoveEvalDrop: { type: Number, default: undefined },
    /** Single top hanging piece in "R@5e" format. */
    hangedPiece: { type: String, default: '' },
    retrySignal: { type: Number, default: 0 },
  },

  emits: {
    result: (v: LLMCoachResponse) => typeof v === 'object' && v !== null,
    error: (msg: string) => typeof msg === 'string',
    loading: (v: boolean) => typeof v === 'boolean',
    retrying: (info: RetryingInfo) => typeof info === 'object' && info !== null,
    'retry-exhausted': (info: RetryExhaustedInfo) => typeof info === 'object' && info !== null,
  },

  data(): Data {
    return {
      loading: false,
      lastError: '',
      lastResult: null,
      unsub: null,
      state: settingsStore.getState(),
      requestSeq: 0,
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
      immediate: true,
      handler() {
        void this.tryRequest()
      },
    },
    coachId() {
      void this.tryRequest()
    },
    retrySignal() {
      void this.tryRequest()
    },
    state: {
      deep: true,
      handler(next, prev) {
        const unchanged =
          !!prev &&
          next?.textLanguage === prev.textLanguage &&
          next?.audioLanguage === prev.audioLanguage
        if (unchanged) return
        void this.tryRequest()
      },
    },
  },

  mounted() {
    this.unsub = settingsStore.subscribe((s) => {
      this.state = s
    })
  },

  beforeUnmount() {
    if (this.unsub) this.unsub()
  },

  methods: {
    async tryRequest() {
      const seq = ++this.requestSeq

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
          sideLastMove: isNonEmptyString(this.sideLastMove) ? this.sideLastMove.trim() : undefined,
          sideToMove: isNonEmptyString(this.sideToMove) ? this.sideToMove.trim() : undefined,
          positionText,
          isUndo: Boolean(this.isUndo),
          isOnlyMove: this.isOnlyMove || analysis.isOnlyMove,
          lastMove: isNonEmptyString(this.lastMove) ? this.lastMove.trim() : undefined,
          lastMoveQuality: isMoveQuality(this.lastMoveQuality) ? this.lastMoveQuality : undefined,
          lastMoveEvalDrop:
            typeof this.lastMoveEvalDrop === 'number' ? this.lastMoveEvalDrop : undefined,
          hangedPiece: isNonEmptyString(this.hangedPiece) ? this.hangedPiece.trim() : undefined,
        },
      )

      this.loading = true
      this.lastError = ''
      this.$emit('loading', true)

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (seq !== this.requestSeq) return

        try {
          const out = await requestLLMCoach(ctx)
          if (seq !== this.requestSeq) return
          this.lastResult = out
          this.$emit('result', out)
          break
        } catch (e: unknown) {
          if (seq !== this.requestSeq) return

          const msg = e instanceof Error ? e.message : String(e)
          const status = e instanceof LLMHttpError ? e.status : 0

          if (isRetryableError(e) && attempt < MAX_RETRIES) {
            this.$emit('retrying', { httpStatus: status, attempt, maxAttempts: MAX_RETRIES })
            await sleep(RETRY_DELAYS[attempt - 1]!)
            continue
          }

          if (isRetryableError(e)) {
            this.$emit('retry-exhausted', { httpStatus: status, message: msg })
          }
          this.lastError = msg
          this.$emit('error', msg)
          break
        }
      }

      if (seq !== this.requestSeq) return
      this.loading = false
      this.$emit('loading', false)
    },
  },
})
</script>

<template>
  <section class="llm-service">
    <div class="row">
      <div class="label">LLM</div>
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

.llm-service {
  display: none;
}
</style>
