<script lang="ts">
import { defineComponent } from 'vue'
import type { EngineAnalysisPayload } from '@/schemes/engineAnalysis'
import { isEngineAnalysisPayload } from '@/schemes/engineAnalysis'
import { BotCoach } from '@/logic/botCoach'
import GeminiService from '@/components/GeminiService.vue'
import { settingsStore, type CoachProfile, type SettingsState } from '@/schemes/settings'
import type { GeminiCoachResponse } from '@/logic/geminiService'
import type { GameInfo, PlayerColor } from '@/schemes/gameInfo'
import { getSideToMoveFromSfen, oppositeColor } from '@/schemes/gameInfo'
import { scoreToKey } from '@/schemes/usi'

type Props = {
  analysis: EngineAnalysisPayload | null
  avatarSrc?: string
  gameInfo?: GameInfo | null
}

type HistoryItem = {
  id: number
  ts: number
  source: 'player' | 'opponent'
}

type HistoryCell =
  | { status: 'pending' }
  | { status: 'done'; text: string }
  | { status: 'error'; message: string }

type Data = {
  coach: BotCoach
  loadError: string
  playerSpeech: string
  opponentSpeech: string
  playerGeminiError: string
  opponentGeminiError: string
  playerGeminiLoading: boolean
  opponentGeminiLoading: boolean
  state: SettingsState
  unsub: null | (() => void)
  playerMeta: EngineAnalysisPayload | null
  opponentMeta: EngineAnalysisPayload | null
  historyOpen: boolean
  history: HistoryItem[]
  historyCells: Record<number, HistoryCell>
  nextHistoryId: number
  pendingHistoryId: Record<HistoryItem['source'], number | null>
}

export default defineComponent({
  name: 'BotCoach',

  components: { GeminiService },

  props: {
    analysis: { type: Object as () => Props['analysis'], default: null },
    avatarSrc: { type: String, default: '' },
    gameInfo: { type: Object as () => Props['gameInfo'], default: null },
  },

  data(): Data {
    return {
      coach: new BotCoach(),
      loadError: '',
      playerSpeech: 'Waiting for analysis...',
      opponentSpeech: 'Waiting for analysis...',
      playerGeminiError: '',
      opponentGeminiError: '',
      playerGeminiLoading: false,
      opponentGeminiLoading: false,
      state: settingsStore.getState(),
      unsub: null,
      playerMeta: null,
      opponentMeta: null,
      historyOpen: false,
      history: [],
      historyCells: {},
      nextHistoryId: 1,
      pendingHistoryId: { player: null, opponent: null },
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

    playerColor(): PlayerColor | null {
      return this.gameInfo?.player.color ?? null
    },

    sideToMoveLabel(): string {
      const side = this.safeAnalysis ? getSideToMoveFromSfen(this.safeAnalysis.sfen) : null
      return this.formatSideLabel(side)
    },

    sideLastMoveLabel(): string {
      const sideToMove = this.safeAnalysis ? getSideToMoveFromSfen(this.safeAnalysis.sfen) : null
      const sideLastMove = sideToMove ? oppositeColor(sideToMove) : null
      return this.formatSideLabel(sideLastMove)
    },
  },

  watch: {
    safeAnalysis: {
      deep: true,
      handler() {
        this.updateMetaSnapshots()
      },
    },
  },

  mounted() {
    this.unsub = settingsStore.subscribe((s) => {
      this.state = s
    })

    void this.ensureInit()
  },

  beforeUnmount() {
    if (this.unsub) this.unsub()
  },

  methods: {
    formatSideLabel(side: PlayerColor | null): string {
      if (!side) return ''
      const who = this.playerColor ? (side === this.playerColor ? 'player' : 'opponent') : null
      const name = side === 'sente' ? 'Sente' : 'Gote'
      return who ? `${name} (${who})` : name
    },

    sideToMoveLabelFor(analysis: EngineAnalysisPayload | null): string {
      const side = analysis ? getSideToMoveFromSfen(analysis.sfen) : null
      return this.formatSideLabel(side)
    },

    sideLastMoveLabelFor(analysis: EngineAnalysisPayload | null): string {
      const sideToMove = analysis ? getSideToMoveFromSfen(analysis.sfen) : null
      const sideLastMove = sideToMove ? oppositeColor(sideToMove) : null
      return this.formatSideLabel(sideLastMove)
    },

    isPlaceholderSpeech(v: string): boolean {
      const t = v.trim().toLowerCase()
      return t.length === 0 || t.startsWith('waiting for')
    },

    getHistoryListEl(): HTMLElement | null {
      const el = this.$refs.historyList
      return el instanceof HTMLElement ? el : null
    },

    scrollHistoryToBottom() {
      if (!this.historyOpen) return
      const el = this.getHistoryListEl()
      if (!el) return
      el.scrollTop = el.scrollHeight
    },

    createPendingHistory(source: HistoryItem['source']): number {
      const existing = this.pendingHistoryId[source]
      if (existing) return existing

      const id = this.nextHistoryId++
      const item: HistoryItem = { id, ts: Date.now(), source }

      this.history.push(item)
      this.historyCells[id] = { status: 'pending' }
      this.pendingHistoryId[source] = id

      if (this.history.length > 100) {
        const removed = this.history.splice(0, this.history.length - 100)
        for (const r of removed) delete this.historyCells[r.id]
      }

      void this.$nextTick(() => this.scrollHistoryToBottom())
      return id
    },

    resolvePendingHistory(source: HistoryItem['source'], text: string) {
      const cleaned = text.trim()
      if (cleaned.length === 0) return
      if (this.isPlaceholderSpeech(cleaned)) return

      const id =
        this.pendingHistoryId[source] ??
        [...this.history].reverse().find((h) => h.source === source && h.id in this.historyCells)
          ?.id ??
        null
      if (!id) return

      this.historyCells[id] = { status: 'done', text: cleaned }
      this.pendingHistoryId[source] = null
      void this.$nextTick(() => this.scrollHistoryToBottom())
    },

    failPendingHistory(source: HistoryItem['source'], message: string) {
      const cleaned = message.trim()
      if (cleaned.length === 0) return

      const id = this.pendingHistoryId[source]
      if (!id) return

      this.historyCells[id] = { status: 'error', message: cleaned }
      this.pendingHistoryId[source] = null
    },

    clearHistory() {
      this.history = []
      this.historyCells = {}
      this.nextHistoryId = 1
      this.pendingHistoryId = { player: null, opponent: null }
    },

    toggleHistory() {
      this.historyOpen = !this.historyOpen
      void this.$nextTick(() => this.scrollHistoryToBottom())
    },

    historyStatus(id: number): HistoryCell['status'] {
      const cell = this.historyCells[id]
      return cell?.status ?? 'pending'
    },

    historyText(id: number): string {
      const cell = this.historyCells[id]
      if (!cell || cell.status === 'pending') return 'Generating...'
      if (cell.status === 'done') return cell.text
      return `Error: ${cell.message}`
    },

    async ensureInit() {
      await this.coach.init()
      this.loadError = this.coach.getLoadError() ?? ''
    },

    updateMetaSnapshots() {
      const analysis = this.safeAnalysis
      if (!analysis) return
      const playerColor = this.playerColor
      if (!playerColor) return

      const sideToMove = getSideToMoveFromSfen(analysis.sfen)
      if (!sideToMove) return

      const lastMoveSide = oppositeColor(sideToMove)
      const lastMover = lastMoveSide === playerColor ? 'player' : 'opponent'

      if (lastMover === 'player') {
        this.playerMeta = analysis
        if (this.isPlaceholderSpeech(this.playerSpeech))
          this.playerSpeech = this.coach.getPhrase(analysis)
      } else {
        this.opponentMeta = analysis
        if (this.isPlaceholderSpeech(this.opponentSpeech))
          this.opponentSpeech = this.coach.getPhrase(analysis)
      }
    },

    formatEval(score: EngineAnalysisPayload['score']): string {
      return scoreToKey(score)
    },

    onPlayerGeminiResult(out: GeminiCoachResponse) {
      this.playerGeminiError = ''
      this.playerSpeech = out.text
      this.resolvePendingHistory('player', out.text)
    },

    onOpponentGeminiResult(out: GeminiCoachResponse) {
      this.opponentGeminiError = ''
      this.opponentSpeech = out.text
      this.resolvePendingHistory('opponent', out.text)
    },

    onPlayerGeminiError(msg: string) {
      this.playerGeminiError = msg
      this.failPendingHistory('player', msg)
      if (this.playerMeta) this.playerSpeech = this.coach.getPhrase(this.playerMeta)
    },

    onOpponentGeminiError(msg: string) {
      this.opponentGeminiError = msg
      this.failPendingHistory('opponent', msg)
      if (this.opponentMeta) this.opponentSpeech = this.coach.getPhrase(this.opponentMeta)
    },

    onPlayerGeminiLoading(v: boolean) {
      this.playerGeminiLoading = v
      if (v) this.createPendingHistory('player')
    },

    onOpponentGeminiLoading(v: boolean) {
      this.opponentGeminiLoading = v
      if (v) this.createPendingHistory('opponent')
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
          <div v-else class="status" :class="{ on: playerGeminiLoading || opponentGeminiLoading }">
            {{ playerGeminiLoading || opponentGeminiLoading ? 'Generating...' : 'Ready' }}
          </div>
        </div>
      </div>
    </header>

    <div class="coach-body">
      <div class="speech-box">
        <div class="speech-title">After Player move</div>
        <div v-if="playerGeminiError" class="error">{{ playerGeminiError }}</div>
        <div class="speech mono">{{ playerSpeech }}</div>
      </div>

      <div class="speech-box">
        <div class="speech-title">After Opponent move</div>
        <div v-if="opponentGeminiError" class="error">{{ opponentGeminiError }}</div>
        <div class="speech mono">{{ opponentSpeech }}</div>
      </div>

      <div class="history-card">
        <div class="history-header">
          <button class="history-toggle" type="button" @click="toggleHistory">
            {{ historyOpen ? 'Hide' : 'Show' }} history ({{ history.length }}/100)
          </button>
          <button
            class="history-clear"
            type="button"
            @click="clearHistory"
            :disabled="history.length === 0"
          >
            Clear
          </button>
        </div>

        <div v-if="historyOpen" ref="historyList" class="history-list mono">
          <div v-for="h in history" :key="h.id" class="history-item">
            <span class="history-role">{{ h.source === 'player' ? 'Player' : 'Opponent' }}:</span>
            <span class="history-text" :class="{ pending: historyStatus(h.id) === 'pending' }">
              {{ historyText(h.id) }}
            </span>
          </div>
        </div>
      </div>

      <GeminiService
        v-if="playerMeta && selectedCoach"
        :analysis="playerMeta"
        :coach-id="selectedCoach.id"
        :coach-name="selectedCoach.name"
        :coach-image="selectedCoach.image"
        :coach-voice="selectedCoach.voice"
        :coach-language="selectedCoach.language"
        :personality-prompt="selectedCoach.personalityPrompt"
        :player-color="playerColor ?? ''"
        :side-last-move="sideLastMoveLabelFor(playerMeta)"
        :side-to-move="sideToMoveLabelFor(playerMeta)"
        position-text="Evaluate the player's last move: intent, quality, risks, and one concrete improvement."
        @result="onPlayerGeminiResult"
        @error="onPlayerGeminiError"
        @loading="onPlayerGeminiLoading"
      />

      <GeminiService
        v-if="opponentMeta && selectedCoach"
        :analysis="opponentMeta"
        :coach-id="selectedCoach.id"
        :coach-name="selectedCoach.name"
        :coach-image="selectedCoach.image"
        :coach-voice="selectedCoach.voice"
        :coach-language="selectedCoach.language"
        :personality-prompt="selectedCoach.personalityPrompt"
        :player-color="playerColor ?? ''"
        :side-last-move="sideLastMoveLabelFor(opponentMeta)"
        :side-to-move="sideToMoveLabelFor(opponentMeta)"
        position-text="Explain the opponent's last move: purpose, threat, and how the player should respond."
        @result="onOpponentGeminiResult"
        @error="onOpponentGeminiError"
        @loading="onOpponentGeminiLoading"
      />

      <details class="meta-panel">
        <summary class="meta-summary">Engine meta (Player + Opponent)</summary>
        <div class="meta-content">
          <div class="player-meta">
            <div class="row">
              <div class="label">SFEN (after Player move)</div>
              <div class="value mono">{{ playerMeta?.sfen ?? '-' }}</div>
            </div>
            <div class="row">
              <div class="label">BestMoveForOpponents</div>
              <div class="value mono">{{ playerMeta?.bestmove ?? '-' }}</div>
            </div>
            <div class="row">
              <div class="label">Ponder</div>
              <div class="value mono">{{ playerMeta?.ponder ?? '-' }}</div>
            </div>
            <div class="row">
              <div class="label">PV</div>
              <div class="value mono">
                {{ playerMeta?.pv?.length ? playerMeta.pv.join(' ') : '-' }}
              </div>
            </div>
            <div class="row">
              <div class="label">EngineEvalForOpponents</div>
              <div class="value mono">{{ playerMeta ? formatEval(playerMeta.score) : '-' }}</div>
            </div>
          </div>

          <div class="opponents-meta">
            <div class="row">
              <div class="label">SFEN (after Opponent move)</div>
              <div class="value mono">{{ opponentMeta?.sfen ?? '-' }}</div>
            </div>
            <div class="row">
              <div class="label">BestMoveForPlayer</div>
              <div class="value mono">{{ opponentMeta?.bestmove ?? '-' }}</div>
            </div>
            <div class="row">
              <div class="label">Ponder</div>
              <div class="value mono">{{ opponentMeta?.ponder ?? '-' }}</div>
            </div>
            <div class="row">
              <div class="label">PV</div>
              <div class="value mono">
                {{ opponentMeta?.pv?.length ? opponentMeta.pv.join(' ') : '-' }}
              </div>
            </div>
            <div class="row">
              <div class="label">EngineEvalForPlayer</div>
              <div class="value mono">
                {{ opponentMeta ? formatEval(opponentMeta.score) : '-' }}
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/design.scss' as *;

.coach-card {
  @include card;
  padding: $space-lg;
}

.coach-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: $space-md;
}

.coach-title {
  display: flex;
  gap: $space-md;
  align-items: center;

  h2 {
    font-size: $text-lg;
    font-weight: 600;
    margin: 0;
    color: $text-primary;
  }
}

.avatar {
  width: 48px;
  height: 48px;
  border-radius: $radius-md;
  object-fit: cover;
  background: $bg-elevated;
  border: 2px solid $border-subtle;
}

.coach-body {
  margin-top: $space-lg;
  display: flex;
  flex-direction: column;
  gap: $space-md;
}

.speech-box {
  @include card-elevated;
  padding: $space-md;
}

.speech-title {
  font-size: $text-sm;
  color: $text-muted;
  margin-bottom: $space-sm;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.speech {
  font-size: $text-base;
  line-height: $line-height-relaxed;
  white-space: pre-wrap;
  word-break: break-word;
  color: $text-primary;
}

.history-card {
  @include card-elevated;
  padding: $space-md;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-md;
}

.history-toggle,
.history-clear {
  @include button-base;
  font-size: $text-sm;
  padding: $space-xs $space-md;
}

.history-clear:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.history-list {
  margin-top: $space-md;
  max-height: 240px;
  overflow-y: auto;
  background: $bg-base;
  border-radius: $radius-md;
  padding: $space-sm $space-md;
  @include scrollbar;
}

.history-item {
  display: flex;
  gap: $space-md;
  padding: $space-sm 0;
  border-bottom: 1px solid $border-subtle;

  &:last-child {
    border-bottom: 0;
  }
}

.history-role {
  flex: 0 0 70px;
  color: $text-muted;
  font-size: $text-sm;
}

.history-text {
  flex: 1;
  font-size: $text-sm;
  white-space: pre-wrap;
  word-break: break-word;
  color: $text-primary;

  &.pending {
    color: $text-muted;
    font-style: italic;
  }
}

.player-meta,
.opponents-meta {
  display: flex;
  flex-direction: column;
  gap: $space-sm;
}

.meta-panel {
  @include card-elevated;
  padding: 0;
  overflow: hidden;
}

.meta-summary {
  @include button-base;
  width: 100%;
  text-align: left;
  font-size: $text-sm;
  padding: $space-sm $space-md;
  list-style: none;
  background: $bg-elevated;
}

.meta-summary::-webkit-details-marker {
  display: none;
}

.meta-panel[open] .meta-summary {
  border-bottom: 1px solid $border-subtle;
}

.meta-content {
  padding: $space-md;
  display: flex;
  flex-direction: column;
  gap: $space-md;
}

.player-meta,
.opponents-meta {
  background: $bg-base;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;
  padding: $space-md;
}

.row {
  display: flex;
  gap: $space-md;
  align-items: flex-start;
}

.label {
  flex: 0 0 160px;
  font-size: $text-sm;
  color: $text-muted;
}

.value {
  flex: 1;
  font-size: $text-sm;
  color: $text-primary;
  word-break: break-all;
}

.mono {
  font-family: $font-mono;
}

.error {
  font-size: $text-sm;
  color: $accent-error;
  margin-bottom: $space-sm;
}

.status {
  font-size: $text-sm;
  color: $text-muted;

  &.on {
    color: $accent-primary;
  }
}
</style>
