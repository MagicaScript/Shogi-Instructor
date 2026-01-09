<template>
  <div class="shogi-board">
    <div class="board-grid">
      <div
        v-for="(piece, index) in cells"
        :key="index"
        class="board-cell"
        :class="{
          selected: selectedIndex === index,
          'drag-target': isDragOver === index,
        }"
        :draggable="!!piece"
        @dragstart="onDragStart($event, index, piece)"
        @dragover.prevent="onDragOver(index)"
        @dragleave="onDragLeave"
        @drop="onDrop($event, index)"
        @click="handleCellClick(index)"
      >
        <ShogiPieceComponent
          v-if="piece"
          :label="piece.label"
          :is-opponent="piece.owner === 'opponent'"
          :is-promoted="piece.promoted"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, shallowReactive, type PropType } from 'vue'
import ShogiPieceComponent from './ShogiPiece.vue'
import { type IShogiPiece, type PlayerOwner, type PieceType } from '@/logic/ShogiPiece'

export interface BoardDragData {
  type: 'MOVE_ON_BOARD'
  fromIndex: number
  pieceData: {
    label: string
    owner: PlayerOwner
  }
}

export interface KomadaiDragData {
  type: 'DROP_FROM_KOMADAI'
  piece: {
    label: string
    count: number
    type: PieceType
  }
  owner: PlayerOwner
}

export type DragData = BoardDragData | KomadaiDragData

export interface CellClickPayload {
  index: number
  cell: IShogiPiece | null
}

export interface PieceMovePayload {
  from: number
  to: number
  piece: IShogiPiece
}

export interface PieceDropPayload {
  pieceType: PieceType
  to: number
  owner: PlayerOwner
}

type BoardActionCallback = (action: string, payload: CellClickPayload) => void

/**
 * ShogiBoard Component.
 */
export default defineComponent({
  name: 'ShogiBoard',
  components: { ShogiPieceComponent },
  props: {
    onBoardAction: {
      type: Function as PropType<BoardActionCallback>,
      default: null,
    },
  },
  emits: ['cell-click', 'piece-move', 'piece-drop'],
  data() {
    return {
      cells: shallowReactive(
        Array(81).fill(null) as (IShogiPiece | null)[],
      ) as (IShogiPiece | null)[],
      selectedIndex: -1 as number,
      isDragOver: -1 as number,
    }
  },
  methods: {
    setCell(index: number, piece: IShogiPiece | null) {
      if (index >= 0 && index < 81) this.cells[index] = piece
    },

    getCell(index: number): IShogiPiece | null {
      return this.cells[index] ?? null
    },

    onDragStart(event: DragEvent, index: number, piece: IShogiPiece | null) {
      if (!piece || !event.dataTransfer) {
        event.preventDefault()
        return
      }

      const dragData: BoardDragData = {
        type: 'MOVE_ON_BOARD',
        fromIndex: index,
        pieceData: {
          label: piece.label,
          owner: piece.owner,
        },
      }
      event.dataTransfer.setData('application/json', JSON.stringify(dragData))
      event.dataTransfer.effectAllowed = 'move'
    },

    onDragOver(index: number) {
      this.isDragOver = index
    },

    onDragLeave() {
      this.isDragOver = -1
    },

    onDrop(event: DragEvent, targetIndex: number) {
      this.isDragOver = -1
      const rawData = event.dataTransfer?.getData('application/json')

      if (!rawData) return

      const data = JSON.parse(rawData) as DragData

      if (data.type === 'MOVE_ON_BOARD') {
        const pieceObj = this.cells[data.fromIndex]
        if (pieceObj) {
          const payload: PieceMovePayload = {
            from: data.fromIndex,
            to: targetIndex,
            piece: pieceObj,
          }
          this.$emit('piece-move', payload)
        }
      } else if (data.type === 'DROP_FROM_KOMADAI') {
        const payload: PieceDropPayload = {
          pieceType: data.piece.type,
          to: targetIndex,
          owner: data.owner,
        }
        this.$emit('piece-drop', payload)
      }
    },

    handleCellClick(index: number) {
      this.selectedIndex = index
      const piece = this.cells[index] ?? null
      const payload: CellClickPayload = { index, cell: piece }
      this.$emit('cell-click', payload)
      if (this.onBoardAction) this.onBoardAction('click', payload)
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles/colors.scss';

.shogi-board {
  padding: 10px;
  background-color: $board-bg;
  border: 5px solid $board-line;
  display: flex;
  justify-content: center;
  align-items: center;
}

.board-grid {
  display: flex;
  flex-wrap: wrap;
  width: 450px;
  height: 450px;
  border-right: 1px solid $board-line;
  border-bottom: 1px solid $board-line;
}

.board-cell {
  width: 50px;
  height: 50px;
  border-left: 1px solid $board-line;
  border-top: 1px solid $board-line;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: center;

  &.selected {
    background-color: rgba(255, 255, 255, 0.3);
  }
}
</style>
