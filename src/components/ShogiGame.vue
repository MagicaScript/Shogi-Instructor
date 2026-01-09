<template>
  <div class="shogi-game-container">
    <ShogiKomadai :pieces="opponentKomadai" :is-opponent="true" />

    <div class="board-area">
      <ShogiBoard ref="boardRef" @piece-move="handlePieceMove" @piece-drop="handlePieceDrop" />
    </div>

    <ShogiKomadai :pieces="myKomadai" :is-opponent="false" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import ShogiBoard from './ShogiBoard.vue'
import ShogiKomadai from './ShogiKomadai.vue'
import {
  ShogiPieceFactory,
  type IShogiPiece,
  type PlayerOwner,
  type PieceType,
} from '@/logic/ShogiPiece'
import type { PieceMovePayload, PieceDropPayload } from './ShogiBoard.vue'

export interface KomadaiItem {
  label: string
  count: number
  type: PieceType
}

interface ShogiBoardInstance {
  setCell: (index: number, piece: IShogiPiece | null) => void
  getCell: (index: number) => IShogiPiece | null
  cells: (IShogiPiece | null)[]
}

/**
 * ShogiGame Controller.
 */
export default defineComponent({
  name: 'ShogiGame',
  components: { ShogiBoard, ShogiKomadai },
  data() {
    return {
      myKomadai: [
        { label: '歩', count: 0, type: 'Pawn' as PieceType },
        { label: '金', count: 0, type: 'Gold' as PieceType },
      ] as KomadaiItem[],
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

      board.setCell(76, ShogiPieceFactory.create('Pawn', 'self'))
      board.setCell(40, ShogiPieceFactory.create('King', 'self'))
      board.setCell(4, ShogiPieceFactory.create('King', 'opponent'))
      board.setCell(12, ShogiPieceFactory.create('Pawn', 'opponent'))
    },

    handlePieceMove(payload: PieceMovePayload) {
      const board = this.getBoardRef()
      if (!board) return

      const targetPiece = board.getCell(payload.to)
      const sourcePiece = payload.piece

      if (targetPiece && targetPiece.owner === sourcePiece.owner) return

      const matrix = sourcePiece.getMovementMatrix()
      const colDiff = (payload.to % 9) - (payload.from % 9)
      const rowDiff = Math.floor(payload.to / 9) - Math.floor(payload.from / 9)

      const matrixX = 2 + colDiff
      const matrixY = 2 + rowDiff

      if (matrixX >= 0 && matrixX < 5 && matrixY >= 0 && matrixY < 5) {
        const row = matrix[matrixY]
        if (row && row[matrixX] === 1) {
          this.executeMove(board, payload.from, payload.to, targetPiece, sourcePiece)
        } else {
          console.log('Invalid move according to piece matrix.')
        }
      } else {
        console.log('Move out of matrix range (needs sliding logic for long range).')
        this.executeMove(board, payload.from, payload.to, targetPiece, sourcePiece)
      }
    },

    executeMove(
      board: ShogiBoardInstance,
      from: number,
      to: number,
      target: IShogiPiece | null,
      source: IShogiPiece,
    ) {
      if (target) {
        this.capturePiece(target, source.owner)
      }
      board.setCell(from, null)
      board.setCell(to, source)
    },

    handlePieceDrop(payload: PieceDropPayload) {
      const board = this.getBoardRef()
      if (!board) return

      if (board.getCell(payload.to)) return

      const newPiece = ShogiPieceFactory.create(payload.pieceType, payload.owner)

      this.removeFromKomadai(payload.pieceType, payload.owner)
      board.setCell(payload.to, newPiece)
    },

    capturePiece(piece: IShogiPiece, capturer: PlayerOwner) {
      const targetKomadai = capturer === 'self' ? this.myKomadai : this.opponentKomadai
      const existingItem = targetKomadai.find((item) => item.label === piece.label)

      if (existingItem) {
        existingItem.count++
      } else {
        console.log(`Captured ${piece.label}! Value: ${piece.getValue()}`)
      }
    },

    removeFromKomadai(type: PieceType, owner: PlayerOwner) {
      const targetKomadai = owner === 'self' ? this.myKomadai : this.opponentKomadai
      const item = targetKomadai.find((i) => i.type === type)

      if (item && item.count > 0) {
        item.count--
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
