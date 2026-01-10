<script lang="ts">
import { defineComponent } from 'vue'
import type { EngineAnalysisPayload } from '@/schemes/engineAnalysis'
import { isEngineAnalysisPayload } from '@/schemes/engineAnalysis'
import { BotCoach } from '@/logic/botCoach'
import GeminiService from '@/components/GeminiService.vue'
import { settingsStore, type CoachProfile, type SettingsState } from '@/schemes/settings'
import type { GeminiCoachResponse } from '@/logic/geminiService'

type Props = {
  analysis: EngineAnalysisPayload | null
  avatarSrc?: string
}

type Data = {
  coach: BotCoach
  speech: string
  loadError: string
  geminiError: string
  geminiLoading: boolean
  state: SettingsState
  unsub: null | (() => void)
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isGeminiCoachResponse(v: unknown): v is GeminiCoachResponse {
  if (!isObject(v)) return false
  return (
    typeof v.text === 'string' &&
    v.text.trim().length > 0 &&
    typeof v.audioText === 'string' &&
    v.audioText.trim().length > 0 &&
    (v.emotion === 'happy' ||
      v.emotion === 'neutral' ||
      v.emotion === 'concerned' ||
      v.emotion === 'excited')
  )
}

export default defineComponent({
  name: 'BotCoach',

  components: { GeminiService },

  props: {
    analysis: { type: Object as () => Props['analysis'], default: null },
    avatarSrc: { type: String, default: '' },
  },

  data(): Data {
    return {
      coach: new BotCoach(),
      speech: 'Waiting for analysis...',
      loadError: '',
      geminiError: '',
      geminiLoading: false,
      state: settingsStore.getState(),
      unsub: null,
    }
  },

  computed: {
    safeAnalysis(): EngineAnalysisPayload | null {
      const v = this.analysis
      if (v === null) return null
      return isEngineAnalysisPayload(v) ? v : null
    },

    selectedCoach(): CoachProfile | null {
      return settingsStore.getCoachById(this.state.coachId)
    },

    coachAvatar(): string {
      if (this.avatarSrc.trim().length > 0) return this.avatarSrc.trim()
      return this.selectedCoach?.image ?? '/bot-avatar.png'
    },

    coachName(): string {
      return this.selectedCoach?.name ?? 'Bot Coach'
    },
  },

  watch: {
    safeAnalysis: {
      deep: true,
      handler() {
        this.updateSpeechLocal()
      },
    },
  },

  mounted() {
    this.unsub = settingsStore.subscribe((s) => {
      this.state = s
    })

    void this.ensureInit().then(() => this.updateSpeechLocal())
  },

  beforeUnmount() {
    if (this.unsub) this.unsub()
  },

  methods: {
    async ensureInit() {
      await this.coach.init()
      this.loadError = this.coach.getLoadError() ?? ''
    },

    updateSpeechLocal() {
      this.speech = this.coach.getPhrase(this.safeAnalysis)
    },

    onGeminiResult(out: GeminiCoachResponse) {
      this.geminiError = ''
      this.speech = out.text
    },

    onGeminiError(msg: string) {
      this.geminiError = msg
      this.updateSpeechLocal()
    },

    onGeminiLoading(v: boolean) {
      this.geminiLoading = v
    },
  },
})
</script>

<template>
  <section class="coach-card">
    <header class="coach-header">
      <div class="coach-title">
        <img class="avatar" :src="coachAvatar" alt="Coach avatar" />
        <div>
          <h2>{{ coachName }}</h2>
          <div v-if="loadError" class="error">{{ loadError }}</div>
          <div v-else-if="geminiError" class="error">{{ geminiError }}</div>
          <div v-else class="status" :class="{ on: geminiLoading }">
            {{ geminiLoading ? 'Generating...' : 'Ready' }}
          </div>
        </div>
      </div>
    </header>

    <div class="coach-body">
      <div class="speech-box">
        <div class="speech mono">
          {{ speech }}
        </div>
      </div>

      <GeminiService
        v-if="safeAnalysis && selectedCoach"
        :analysis="safeAnalysis"
        :coach-id="selectedCoach.id"
        :coach-name="selectedCoach.name"
        :coach-image="selectedCoach.image"
        :coach-voice="selectedCoach.voice"
        :coach-language="selectedCoach.language"
        :personality-prompt="selectedCoach.personalityPrompt"
        @result="onGeminiResult"
        @error="onGeminiError"
        @loading="onGeminiLoading"
      />

      <div class="meta" v-if="safeAnalysis">
        <div class="row">
          <div class="label">SFEN</div>
          <div class="value mono">{{ safeAnalysis.sfen }}</div>
        </div>
        <div class="row">
          <div class="label">Bestmove</div>
          <div class="value mono">{{ safeAnalysis.bestmove ?? '-' }}</div>
        </div>
        <div class="row">
          <div class="label">Ponder</div>
          <div class="value mono">{{ safeAnalysis.ponder ?? '-' }}</div>
        </div>
        <div class="row">
          <div class="label">PV</div>
          <div class="value mono">
            {{ safeAnalysis.pv?.length ? safeAnalysis.pv.join(' ') : '-' }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.coach-card {
  width: 980px;
  max-width: calc(100vw - 48px);
  border: 1px solid #ddd;
  border-radius: 14px;
  padding: 14px 16px;
  background: #fff;
  margin-top: 14px;
}

.coach-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.coach-title {
  display: flex;
  gap: 12px;
  align-items: center;
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  object-fit: cover;
  border: 1px solid #eee;
}

.coach-body {
  margin-top: 12px;
  display: grid;
  gap: 12px;
}

.speech-box {
  border: 1px solid #eee;
  border-radius: 12px;
  background: #fafafa;
  padding: 10px 12px;
}

.speech {
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.meta {
  display: grid;
  gap: 8px;
}

.row {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 12px;
  align-items: start;
}

.label {
  font-size: 12px;
  color: #666;
  padding-top: 3px;
}

.value {
  font-size: 13px;
  color: #111;
  word-break: break-word;
}

.mono {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
}

.error {
  margin-top: 2px;
  font-size: 12px;
  color: #b00020;
}

.status {
  margin-top: 2px;
  font-size: 12px;
  color: #666;
}

.status.on {
  color: #111;
}
</style>
