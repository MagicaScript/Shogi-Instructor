<template>
  <div class="shogi-game-shell">
    <div class="shogi-game-container" :class="{ readonly: syncEnabled }">
      <ShogiKomadai
        :pieces="opponentKomadai"
        :is-opponent="true"
        @komadai-drag-start="handleKomadaiDragStart"
        @komadai-drag-end="handleKomadaiDragEnd"
      />

      <div class="board-area">
        <ShogiBoard ref="boardRef" @piece-move="handlePieceMove" @piece-drop="handlePieceDrop" />
      </div>

      <ShogiKomadai
        :pieces="myKomadai"
        :is-opponent="false"
        @komadai-drag-start="handleKomadaiDragStart"
        @komadai-drag-end="handleKomadaiDragEnd"
      />
    </div>

    <div v-if="syncEnabled && syncError" class="sync-overlay">
      <div class="sync-overlay-card">
        <div class="sync-title">Sync Error</div>
        <div class="sync-error">{{ syncError }}</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import ShogiBoard from './ShogiBoard.vue'
import ShogiKomadai, { type PieceSelectedPayload } from './ShogiKomadai.vue'
import {
  ShogiPieceFactory,
  type IShogiPiece,
  type PlayerOwner,
  type PieceType,
} from '@/logic/ShogiPiece'
import type { PieceMovePayload, PieceDropPayload } from './ShogiBoard.vue'
import { parseSFEN, toSFEN, type KomadaiItem } from '@/utils/sfenUtils'
import { calculateLegalMovesOnBoard, calculateLegalDrops } from '@/logic/shogiRules'

interface ShogiBoardInstance {
  setCell: (index: number, piece: IShogiPiece | null) => void
  getCell: (index: number) => IShogiPiece | null
  previewDropTargets: (pieceType: PieceType, owner: PlayerOwner) => void
  clearSelection: () => void
  cells: (IShogiPiece | null)[]
}

type LishogiStateItem = {
  ply: number
  usi: string | null
  sfen: string
  notation?: string
}

type LishogiStateResponse = {
  state: LishogiStateItem[]
  timestamp: number
  age_ms: number
}

const DEFAULT_SFEN = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1'
const LISHOGI_STATE_URL = 'http://127.0.0.1:3080/api/state'

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

/**
 * ShogiGame Controller.
 * When sync is enabled, the game becomes read-only and follows the remote SFEN state.
 */
export default defineComponent({
  name: 'ShogiGame',
  components: { ShogiBoard, ShogiKomadai },
  props: {
    syncEnabled: { type: Boolean, default: false },
    syncIntervalMs: { type: Number, default: 1000 },
  },
  emits: {
    'sfen-change': (sfen: string) => typeof sfen === 'string' && sfen.trim().length > 0,
  },
  data() {
    return {
      myKomadai: [] as KomadaiItem[],
      opponentKomadai: [] as KomadaiItem[],
      currentTurn: 'self' as PlayerOwner,
      moveNumber: 1,
      lastSyncedSFEN: '' as string,
      syncTimer: null as ReturnType<typeof setInterval> | null,
      syncError: '' as string,
    }
  },
  mounted() {
    this.initGame()
    if (this.syncEnabled) this.startSync()
  },
  beforeUnmount() {
    this.stopSync()
  },
  watch: {
    syncEnabled(next: boolean) {
      if (next) this.startSync()
      else this.stopSync()
    },
  },
  methods: {
    getBoardRef(): ShogiBoardInstance | null {
      return (this.$refs.boardRef as ShogiBoardInstance | undefined) ?? null
    },

    initGame() {
      const board = this.getBoardRef()
      if (!board) return

      this.applySFEN(DEFAULT_SFEN)
      board.clearSelection()
    },

    emitCurrentSFEN() {
      const exported = this.exportSFEN()
      if (!isNonEmptyString(exported)) return
      this.$emit('sfen-change', exported)
    },

    applySFEN(sfen: string) {
      const board = this.getBoardRef()
      if (!board) return

      const parsed = parseSFEN(sfen)
      const boardState = Array<IShogiPiece | null>(81).fill(null)
      for (const [idx, piece] of parsed.boardState) {
        boardState[idx] = piece
      }
      const myKomadai = parsed.myKomadai as KomadaiItem[]
      const opponentKomadai = parsed.opponentKomadai as KomadaiItem[]
      const turn = parsed.turn as PlayerOwner

      for (let i = 0; i < 81; i++) board.setCell(i, null)
      boardState.forEach((piece, index) => board.setCell(index, piece))

      this.myKomadai = myKomadai
      this.opponentKomadai = opponentKomadai
      this.currentTurn = turn

      const mn = this.extractMoveNumberFromSFEN(sfen)
      if (mn !== null) this.moveNumber = mn

      this.emitCurrentSFEN()
    },

    extractMoveNumberFromSFEN(sfen: string): number | null {
      const parts = sfen.trim().split(/\s+/)
      const last = parts[parts.length - 1]
      if (!last) return null
      const n = Number.parseInt(last, 10)
      return Number.isFinite(n) ? n : null
    },

    exportSFEN(): string {
      const board = this.getBoardRef()
      if (!board) return ''

      return toSFEN(
        board.cells,
        this.currentTurn,
        this.myKomadai,
        this.opponentKomadai,
        this.moveNumber,
      )
    },

    startSync() {
      if (this.syncTimer) return
      this.syncError = ''
      this.syncOnce()
      this.syncTimer = setInterval(() => {
        this.syncOnce()
      }, this.syncIntervalMs)
    },

    stopSync() {
      if (!this.syncTimer) return
      clearInterval(this.syncTimer)
      this.syncTimer = null
      this.syncError = ''
    },

    async syncOnce() {
      try {
        const res = await fetch(LISHOGI_STATE_URL, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const data = (await res.json()) as LishogiStateResponse
        if (!Array.isArray(data.state) || data.state.length === 0) return

        const latest = data.state[data.state.length - 1]
        if (!latest?.sfen) return

        if (latest.sfen === this.lastSyncedSFEN) return
        this.lastSyncedSFEN = latest.sfen

        const board = this.getBoardRef()
        if (board) board.clearSelection()

        this.applySFEN(latest.sfen)

        const derivedMoveNumber = latest.ply + 1
        if (!this.extractMoveNumberFromSFEN(latest.sfen)) this.moveNumber = derivedMoveNumber

        this.emitCurrentSFEN()
        this.syncError = ''
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        this.syncError = `Sync failed: ${msg}`
      }
    },

    handleKomadaiDragStart(payload: PieceSelectedPayload) {
      if (this.syncEnabled) return
      const board = this.getBoardRef()
      if (!board) return
      board.previewDropTargets(payload.piece.type, payload.owner)
    },

    handleKomadaiDragEnd() {
      if (this.syncEnabled) return
      const board = this.getBoardRef()
      if (!board) return
      board.clearSelection()
    },

    handlePieceMove(payload: PieceMovePayload) {
      if (this.syncEnabled) return
      const board = this.getBoardRef()
      if (!board) return

      const source = board.getCell(payload.from)
      if (!source) return

      const target = board.getCell(payload.to)
      if (target && target.owner === source.owner) return

      const legal = calculateLegalMovesOnBoard(source, payload.from, board.cells)
      if (!legal.includes(payload.to)) return

      this.executeMove(board, payload.from, payload.to, target, source)
    },

    executeMove(
      board: ShogiBoardInstance,
      from: number,
      to: number,
      target: IShogiPiece | null,
      source: IShogiPiece,
    ) {
      if (target) this.capturePiece(target, source.owner)
      board.setCell(from, null)
      board.setCell(to, source)
      this.moveNumber++
      this.emitCurrentSFEN()
    },

    handlePieceDrop(payload: PieceDropPayload) {
      if (this.syncEnabled) return
      const board = this.getBoardRef()
      if (!board) return

      if (board.getCell(payload.to)) return
      if (!this.hasInKomadai(payload.pieceType, payload.owner)) return

      const legalDrops = calculateLegalDrops(payload.pieceType, payload.owner, board.cells)
      if (!legalDrops.includes(payload.to)) return

      const newPiece = ShogiPieceFactory.create(payload.pieceType, payload.owner)
      this.removeFromKomadai(payload.pieceType, payload.owner)
      board.setCell(payload.to, newPiece)
      this.moveNumber++
      this.emitCurrentSFEN()
    },

    hasInKomadai(type: PieceType, owner: PlayerOwner): boolean {
      const targetKomadai = owner === 'self' ? this.myKomadai : this.opponentKomadai
      const item = targetKomadai.find((i) => i.type === type)
      return !!item && item.count > 0
    },

    capturePiece(piece: IShogiPiece, capturer: PlayerOwner) {
      const targetKomadai = capturer === 'self' ? this.myKomadai : this.opponentKomadai
      const type = piece.type

      const existing = targetKomadai.find((item) => item.type === type)
      if (existing) {
        existing.count++
        return
      }

      const label = ShogiPieceFactory.create(type, capturer).label
      targetKomadai.push({ label, count: 1, type })
    },

    removeFromKomadai(type: PieceType, owner: PlayerOwner) {
      const targetKomadai = owner === 'self' ? this.myKomadai : this.opponentKomadai
      const item = targetKomadai.find((i) => i.type === type)
      if (!item) return

      item.count = Math.max(0, item.count - 1)
      if (item.count === 0) {
        const idx = targetKomadai.indexOf(item)
        if (idx >= 0) targetKomadai.splice(idx, 1)
      }
    },
  },
})
</script>

<style scoped>
.shogi-game-shell {
  position: relative;
}

.shogi-game-container {
  display: flex;
  gap: 20px;
  justify-content: center;
  padding: 20px;
}

.sync-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(2px);
}

.sync-overlay-card {
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  text-align: center;
}

.sync-title {
  font-weight: 700;
  color: #111;
}

.sync-error {
  margin-top: 6px;
  font-size: 12px;
  color: #b00020;
  max-width: 420px;
}
</style>
