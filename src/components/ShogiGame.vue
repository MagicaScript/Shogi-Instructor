<template>
  <div class="shogi-game-container">
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
import { parseSFEN, type KomadaiItem } from '@/utils/sfenUtils'
import { calculateLegalMovesOnBoard, calculateLegalDrops } from '@/logic/shogiRules'

interface ShogiBoardInstance {
  setCell: (index: number, piece: IShogiPiece | null) => void
  getCell: (index: number) => IShogiPiece | null
  previewDropTargets: (pieceType: PieceType, owner: PlayerOwner) => void
  clearSelection: () => void
  cells: (IShogiPiece | null)[]
}

const DEFAULT_SFEN = 'lnsgkgsnl/1r5b1/pppp+rpppp/4p4/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1'

/**
 * ShogiGame Controller.
 * Applies moves/drops with the same legality rules as the board highlight.
 */
export default defineComponent({
  name: 'ShogiGame',
  components: { ShogiBoard, ShogiKomadai },
  data() {
    return {
      myKomadai: [] as KomadaiItem[],
      opponentKomadai: [] as KomadaiItem[],
    }
  },
  mounted() {
    this.initGame()
  },
  methods: {
    getBoardRef(): ShogiBoardInstance | null {
      return (this.$refs.boardRef as ShogiBoardInstance | undefined) ?? null
    },

    initGame() {
      const board = this.getBoardRef()
      if (!board) return

      const { boardState, myKomadai, opponentKomadai } = parseSFEN(DEFAULT_SFEN)

      for (let i = 0; i < 81; i++) board.setCell(i, null)
      boardState.forEach((piece, index) => board.setCell(index, piece))

      this.myKomadai = myKomadai
      this.opponentKomadai = opponentKomadai
    },

    handleKomadaiDragStart(payload: PieceSelectedPayload) {
      const board = this.getBoardRef()
      if (!board) return
      board.previewDropTargets(payload.piece.type, payload.owner)
    },

    handleKomadaiDragEnd() {
      const board = this.getBoardRef()
      if (!board) return
      board.clearSelection()
    },

    handlePieceMove(payload: PieceMovePayload) {
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
    },

    handlePieceDrop(payload: PieceDropPayload) {
      const board = this.getBoardRef()
      if (!board) return

      if (board.getCell(payload.to)) return
      if (!this.hasInKomadai(payload.pieceType, payload.owner)) return

      const legalDrops = calculateLegalDrops(payload.pieceType, payload.owner, board.cells)
      if (!legalDrops.includes(payload.to)) return

      const newPiece = ShogiPieceFactory.create(payload.pieceType, payload.owner)
      this.removeFromKomadai(payload.pieceType, payload.owner)
      board.setCell(payload.to, newPiece)
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

      // captured promoted piece becomes unpromoted in hand
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
.shogi-game-container {
  display: flex;
  gap: 20px;
  justify-content: center;
  padding: 20px;
}
</style>
