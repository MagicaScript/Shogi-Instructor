<script lang="ts">
import { defineComponent } from 'vue'
import type { EngineAnalysisPayload } from '@/schemes/engineAnalysis'
import { isEngineAnalysisPayload } from '@/schemes/engineAnalysis'
import { BotCoach } from '@/logic/botCoach'
import LLMService from '@/components/LLMService.vue'
import { settingsStore, type CoachProfile, type SettingsState } from '@/schemes/settings'
import type { LLMCoachResponse } from '@/logic/llmService'
import type { GameInfo, PlayerColor } from '@/schemes/gameInfo'
import { getSideToMoveFromSfen, oppositeColor } from '@/schemes/gameInfo'
import { scoreToKey } from '@/schemes/usi'
import type { MoveHistoryEntry, MoveQuality } from '@/schemes/moveHistory'
import {
  computeMoveQualityWithContext,
  moveQualityLabel,
  computeEvalDrop,
} from '@/logic/moveQuality'
import { normalizeSfen } from '@/schemes/engineAnalysis'
import { parseSFEN } from '@/utils/sfenUtils'
import type { IShogiPiece, PlayerOwner } from '@/logic/shogiPiece'
import { findTopHangingPieceLabel } from '@/logic/shogiRules'

type Props = {
  analysis: EngineAnalysisPayload | null
  avatarSrc?: string
  gameInfo?: GameInfo | null
  moveHistory?: MoveHistoryEntry[]
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

type LLMState = 'idle' | 'loading' | 'success' | 'error'

type Data = {
  coach: BotCoach
  loadError: string
  playerLLMError: string
  opponentLLMError: string
  playerLLMLoading: boolean
  opponentLLMLoading: boolean
  playerLLMState: LLMState
  opponentLLMState: LLMState
  playerLastSuccessText: string
  opponentLastSuccessText: string
  state: SettingsState
  unsub: null | (() => void)
  playerMeta: EngineAnalysisPayload | null
  opponentMeta: EngineAnalysisPayload | null
  historyOpen: boolean
  history: HistoryItem[]
  historyCells: Record<number, HistoryCell>
  nextHistoryId: number
  pendingHistoryId: Record<HistoryItem['source'], number | null>
  /** Maps SFEN (normalized) to EngineAnalysisPayload for linking to move history */
  analysisCache: Map<string, EngineAnalysisPayload>
  /** Computed move quality for the last player move */
  playerLastMoveQuality: MoveQuality
  /** Computed move quality for the last opponent move */
  opponentLastMoveQuality: MoveQuality
  /** The last move by the player in USI format (e.g. '7g7f'). */
  playerLastMove: string
  /** The last move by the opponent in USI format (e.g. '7g7f'). */
  opponentLastMove: string
  /** Eval drop for the player's last move. */
  playerLastMoveEvalDrop: number | null
  /** Eval drop for the opponent's last move. */
  opponentLastMoveEvalDrop: number | null
}

export default defineComponent({
  name: 'BotCoach',

  components: { LLMService },

  props: {
    analysis: { type: Object as () => Props['analysis'], default: null },
    avatarSrc: { type: String, default: '' },
    gameInfo: { type: Object as () => Props['gameInfo'], default: null },
    moveHistory: { type: Array as () => MoveHistoryEntry[], default: () => [] },
  },

  data(): Data {
    return {
      coach: new BotCoach(),
      loadError: '',
      playerLLMError: '',
      opponentLLMError: '',
      playerLLMLoading: false,
      opponentLLMLoading: false,
      playerLLMState: 'idle' as LLMState,
      opponentLLMState: 'idle' as LLMState,
      playerLastSuccessText: '',
      opponentLastSuccessText: '',
      state: settingsStore.getState(),
      unsub: null,
      playerMeta: null,
      opponentMeta: null,
      historyOpen: false,
      history: [],
      historyCells: {},
      nextHistoryId: 1,
      pendingHistoryId: { player: null, opponent: null },
      analysisCache: new Map<string, EngineAnalysisPayload>(),
      playerLastMoveQuality: 'unknown' as MoveQuality,
      opponentLastMoveQuality: 'unknown' as MoveQuality,
      playerLastMove: '',
      opponentLastMove: '',
      playerLastMoveEvalDrop: null,
      opponentLastMoveEvalDrop: null,
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
        this.cacheAnalysis()
        this.updateMoveQualities()
      },
    },
    moveHistory: {
      deep: true,
      handler() {
        this.updateMoveQualities()
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
      return t.length === 0 || t.startsWith('waiting for') || t.startsWith('thinking')
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
        this.resetLLMStateFor('player')
      } else {
        this.opponentMeta = analysis
        this.resetLLMStateFor('opponent')
      }
    },

    formatEval(score: EngineAnalysisPayload['score']): string {
      return scoreToKey(score)
    },

    buildCellsFromSfen(sfen: string): (IShogiPiece | null)[] {
      const parsed = parseSFEN(sfen)
      const cells = Array<IShogiPiece | null>(81).fill(null)
      for (const [idx, piece] of parsed.boardState) {
        cells[idx] = piece
      }
      return cells
    },

    hangedPieceFor(analysis: EngineAnalysisPayload | null): string {
      if (!analysis) return ''
      const playerColor = this.playerColor
      if (!playerColor) return ''
      const sideToMove = getSideToMoveFromSfen(analysis.sfen)
      if (!sideToMove) return ''

      const playerOwner: PlayerOwner = playerColor === 'sente' ? 'self' : 'opponent'
      const opponentOwner: PlayerOwner = playerOwner === 'self' ? 'opponent' : 'self'
      const targetOwner = sideToMove === playerColor ? opponentOwner : playerOwner

      try {
        const cells = this.buildCellsFromSfen(analysis.sfen)
        return findTopHangingPieceLabel(cells, targetOwner) ?? ''
      } catch {
        return ''
      }
    },

    /**
     * Caches the current analysis by normalized SFEN for later linking.
     */
    cacheAnalysis() {
      const analysis = this.safeAnalysis
      if (!analysis) return

      const key = normalizeSfen(analysis.sfen)
      this.analysisCache.set(key, analysis)

      // Limit cache size to prevent memory leaks
      if (this.analysisCache.size > 200) {
        const oldest = this.analysisCache.keys().next().value
        if (oldest) this.analysisCache.delete(oldest)
      }
    },

    /**
     * Finds the analysis for a given SFEN from the cache.
     */
    findAnalysisForSfen(sfen: string): EngineAnalysisPayload | null {
      const key = normalizeSfen(sfen)
      return this.analysisCache.get(key) ?? null
    },

    /**
     * Links analysis results to move history entries and computes move qualities.
     *
     * The key insight:
     * - When analyzing SFEN at ply=N, the engine's bestmove is the recommendation
     *   for the side-to-move at that position.
     * - The move at ply=N+1 was made by that side-to-move.
     * - So we link the analysis of ply=N's SFEN to the move entry at ply=N+1.
     */
    updateMoveQualities() {
      const playerColor = this.playerColor
      if (!playerColor) return

      const history = this.moveHistory
      if (!history || history.length === 0) {
        this.playerLastMoveQuality = 'unknown'
        this.opponentLastMoveQuality = 'unknown'
        return
      }

      // Find the last player move and last opponent move
      let lastPlayerEntry: MoveHistoryEntry | null = null
      let lastOpponentEntry: MoveHistoryEntry | null = null
      let prevPlayerAnalysis: EngineAnalysisPayload | null = null
      let prevOpponentAnalysis: EngineAnalysisPayload | null = null

      for (let i = history.length - 1; i >= 0; i--) {
        const entry = history[i]
        if (!entry) continue

        const isPlayer = entry.moveBySide === playerColor

        if (isPlayer && !lastPlayerEntry) {
          lastPlayerEntry = entry
          // Find analysis for the position BEFORE this move was made
          // That's the position at ply-1 (the previous entry's sfenAfter)
          if (i > 0) {
            const prevEntry = history[i - 1]
            if (prevEntry) {
              prevPlayerAnalysis = this.findAnalysisForSfen(prevEntry.sfenAfter)
            }
          }
        } else if (!isPlayer && !lastOpponentEntry) {
          lastOpponentEntry = entry
          if (i > 0) {
            const prevEntry = history[i - 1]
            if (prevEntry) {
              prevOpponentAnalysis = this.findAnalysisForSfen(prevEntry.sfenAfter)
            }
          }
        }

        if (lastPlayerEntry && lastOpponentEntry) break
      }

      // Compute quality for player's last move
      if (lastPlayerEntry && prevPlayerAnalysis) {
        // Update the entry with analysis data
        lastPlayerEntry.recommendedBestMove = prevPlayerAnalysis.bestmove
        lastPlayerEntry.isOnlyMove = prevPlayerAnalysis.isOnlyMove

        // Find the analysis for AFTER the move (current position)
        const afterAnalysis = this.findAnalysisForSfen(lastPlayerEntry.sfenAfter)
        lastPlayerEntry.evalAfterMove = afterAnalysis?.score ?? null

        this.playerLastMoveQuality = computeMoveQualityWithContext(
          lastPlayerEntry,
          prevPlayerAnalysis.score,
        )
        // Compute eval drop for player's last move
        this.playerLastMoveEvalDrop = computeEvalDrop(
          prevPlayerAnalysis.score,
          lastPlayerEntry.evalAfterMove,
        )
      } else {
        this.playerLastMoveQuality = 'unknown'
        this.playerLastMoveEvalDrop = null
      }

      // Compute quality for opponent's last move
      if (lastOpponentEntry && prevOpponentAnalysis) {
        lastOpponentEntry.recommendedBestMove = prevOpponentAnalysis.bestmove
        lastOpponentEntry.isOnlyMove = prevOpponentAnalysis.isOnlyMove

        const afterAnalysis = this.findAnalysisForSfen(lastOpponentEntry.sfenAfter)
        lastOpponentEntry.evalAfterMove = afterAnalysis?.score ?? null

        this.opponentLastMoveQuality = computeMoveQualityWithContext(
          lastOpponentEntry,
          prevOpponentAnalysis.score,
        )
        // Compute eval drop for opponent's last move
        this.opponentLastMoveEvalDrop = computeEvalDrop(
          prevOpponentAnalysis.score,
          lastOpponentEntry.evalAfterMove,
        )
      } else {
        this.opponentLastMoveQuality = 'unknown'
        this.opponentLastMoveEvalDrop = null
      }

      // Extract USI move strings for passing to LLM
      this.playerLastMove = lastPlayerEntry?.usiMoveFull ?? lastPlayerEntry?.usiMove ?? ''
      this.opponentLastMove = lastOpponentEntry?.usiMoveFull ?? lastOpponentEntry?.usiMove ?? ''
    },

    /**
     * Returns a human-readable label for move quality.
     */
    formatMoveQuality(quality: MoveQuality): string {
      return moveQualityLabel(quality)
    },

    onPlayerLLMResult(out: LLMCoachResponse) {
      this.playerLLMError = ''
      this.playerLastSuccessText = out.text
      this.playerLLMState = 'success'
      this.resolvePendingHistory('player', out.text)
    },

    onOpponentLLMResult(out: LLMCoachResponse) {
      this.opponentLLMError = ''
      this.opponentLastSuccessText = out.text
      this.opponentLLMState = 'success'
      this.resolvePendingHistory('opponent', out.text)
    },

    onPlayerLLMError(msg: string) {
      this.playerLLMError = msg
      this.playerLLMState = 'error'
      this.failPendingHistory('player', msg)
    },

    onOpponentLLMError(msg: string) {
      this.opponentLLMError = msg
      this.opponentLLMState = 'error'
      this.failPendingHistory('opponent', msg)
    },

    onPlayerLLMLoading(v: boolean) {
      this.playerLLMLoading = v
      if (v) this.playerLLMState = 'loading'
      else if (this.playerLLMState === 'loading') {
        if (this.playerLLMError) this.playerLLMState = 'error'
        else if (this.playerLastSuccessText.trim().length > 0) this.playerLLMState = 'success'
        else this.playerLLMState = 'idle'
      }
      if (v) this.createPendingHistory('player')
    },

    onOpponentLLMLoading(v: boolean) {
      this.opponentLLMLoading = v
      if (v) this.opponentLLMState = 'loading'
      else if (this.opponentLLMState === 'loading') {
        if (this.opponentLLMError) this.opponentLLMState = 'error'
        else if (this.opponentLastSuccessText.trim().length > 0) this.opponentLLMState = 'success'
        else this.opponentLLMState = 'idle'
      }
      if (v) this.createPendingHistory('opponent')
    },

    resetLLMStateFor(source: HistoryItem['source']) {
      if (source === 'player') {
        this.playerLLMError = ''
        if (this.playerLLMState !== 'loading') this.playerLLMState = 'idle'
      } else {
        this.opponentLLMError = ''
        if (this.opponentLLMState !== 'loading') this.opponentLLMState = 'idle'
      }
    },

    displaySpeechText(source: HistoryItem['source']): string {
      if (source === 'player') {
        if (this.playerLLMState === 'idle') return 'Waiting for analysis...'
        if (this.playerLLMState === 'success' || this.playerLLMState === 'loading') {
          const t = this.playerLastSuccessText.trim()
          return t.length > 0 ? t : 'Thinking'
        }
        if (this.playerLLMState === 'error') {
          const t = this.playerLastSuccessText.trim()
          return t.length > 0 ? t : 'Thinking'
        }
        return 'Thinking'
      }

      if (this.opponentLLMState === 'idle') return 'Waiting for analysis...'
      if (this.opponentLLMState === 'success' || this.opponentLLMState === 'loading') {
        const t = this.opponentLastSuccessText.trim()
        return t.length > 0 ? t : 'Thinking'
      }
      if (this.opponentLLMState === 'error') {
        const t = this.opponentLastSuccessText.trim()
        return t.length > 0 ? t : 'Thinking'
      }
      return 'Thinking'
    },

    showThinking(source: HistoryItem['source']): boolean {
      if (source === 'player') {
        if (this.playerLLMError) return false
        const last = this.playerLastSuccessText.trim()
        return this.playerLLMState === 'loading' && last.length === 0
      }

      if (this.opponentLLMError) return false
      const last = this.opponentLastSuccessText.trim()
      return this.opponentLLMState === 'loading' && last.length === 0
    },

    showSpinner(source: HistoryItem['source']): boolean {
      if (source === 'player') {
        return (
          this.playerLLMState === 'loading' &&
          this.playerLastSuccessText.trim().length > 0 &&
          !this.playerLLMError
        )
      }

      return (
        this.opponentLLMState === 'loading' &&
        this.opponentLastSuccessText.trim().length > 0 &&
        !this.opponentLLMError
      )
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
          <div v-else class="status" :class="{ on: playerLLMLoading || opponentLLMLoading }">
            {{ playerLLMLoading || opponentLLMLoading ? 'Generating...' : 'Ready' }}
          </div>
        </div>
      </div>
    </header>

    <div class="coach-body">
      <div class="speech-box">
        <div class="speech-title">After Player move</div>
        <div v-if="playerLLMError" class="error">{{ playerLLMError }}</div>
        <div class="speech mono">
          <span class="speech-text" :class="{ blink: showThinking('player') }">
            {{ displaySpeechText('player') }}
          </span>
          <span v-if="showThinking('player')" class="thinking-dots" aria-hidden="true">
            <span class="dot">·</span><span class="dot">·</span><span class="dot">·</span>
          </span>
          <span v-if="showSpinner('player')" class="loading-spinner" aria-hidden="true"></span>
        </div>
      </div>

      <div class="speech-box">
        <div class="speech-title">After Opponent move</div>
        <div v-if="opponentLLMError" class="error">{{ opponentLLMError }}</div>
        <div class="speech mono">
          <span class="speech-text" :class="{ blink: showThinking('opponent') }">
            {{ displaySpeechText('opponent') }}
          </span>
          <span v-if="showThinking('opponent')" class="thinking-dots" aria-hidden="true">
            <span class="dot">·</span><span class="dot">·</span><span class="dot">·</span>
          </span>
          <span v-if="showSpinner('opponent')" class="loading-spinner" aria-hidden="true"></span>
        </div>
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

      <LLMService
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
        :is-only-move="playerMeta.isOnlyMove"
        :last-move="playerLastMove"
        :last-move-quality="playerLastMoveQuality"
        :last-move-eval-drop="playerLastMoveEvalDrop ?? undefined"
        :hanged-piece="hangedPieceFor(playerMeta)"
        position-text="Evaluate the player's last move."
        @result="onPlayerLLMResult"
        @error="onPlayerLLMError"
        @loading="onPlayerLLMLoading"
      />

      <LLMService
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
        :is-only-move="opponentMeta.isOnlyMove"
        :last-move="opponentLastMove"
        :last-move-quality="opponentLastMoveQuality"
        :last-move-eval-drop="opponentLastMoveEvalDrop ?? undefined"
        :hanged-piece="hangedPieceFor(opponentMeta)"
        position-text="Explain your last move: purpose, threat, and how the player should respond."
        @result="onOpponentLLMResult"
        @error="onOpponentLLMError"
        @loading="onOpponentLLMLoading"
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

.speech-text.blink {
  animation: speech-blink 1.4s ease-in-out infinite;
}

.thinking-dots {
  display: inline-flex;
  gap: 4px;
  margin-left: 4px;
}

.thinking-dots .dot {
  opacity: 0.2;
  animation: thinking-dots 1.2s ease-in-out infinite;

  &:nth-child(2) {
    animation-delay: 0.2s;
  }

  &:nth-child(3) {
    animation-delay: 0.4s;
  }
}

.loading-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-left: 8px;
  border-radius: 50%;
  border: 2px solid $border-subtle;
  border-top-color: $accent-primary;
  animation:
    spinner-rotate 1s linear infinite,
    spinner-breathe 1.6s ease-in-out infinite;
  vertical-align: -2px;
}

@keyframes thinking-dots {
  0%,
  100% {
    opacity: 0.2;
  }
  50% {
    opacity: 1;
  }
}

@keyframes speech-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.65;
  }
}

@keyframes spinner-rotate {
  to {
    transform: rotate(360deg);
  }
}

@keyframes spinner-breathe {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
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
