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
          'legal-move': legalMoves.includes(index),
        }"
        :draggable="!!piece"
        @dragstart="onDragStart($event, index)"
        @dragend="onDragEnd"
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
        <div v-if="legalMoves.includes(index) && !piece" class="legal-marker"></div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, shallowReactive, type PropType } from 'vue'
import ShogiPieceComponent from './ShogiPiece.vue'
import { type IShogiPiece, type PlayerOwner, type PieceType } from '@/logic/shogiPiece'
import { calculateLegalMovesOnBoard, calculateLegalDrops } from '@/logic/shogiRules'

export interface BoardDragData {
  type: 'MOVE_ON_BOARD'
  fromIndex: number
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
      legalMoves: [] as number[],
      previewDrop: null as null | { pieceType: PieceType; owner: PlayerOwner },
    }
  },
  methods: {
    setCell(index: number, piece: IShogiPiece | null) {
      if (index >= 0 && index < 81) this.cells[index] = piece
    },

    getCell(index: number): IShogiPiece | null {
      return this.cells[index] ?? null
    },

    clearSelection() {
      this.selectedIndex = -1
      this.legalMoves = []
      this.previewDrop = null
    },

    previewDropTargets(pieceType: PieceType, owner: PlayerOwner) {
      this.selectedIndex = -1
      this.previewDrop = { pieceType, owner }
      this.legalMoves = calculateLegalDrops(pieceType, owner, this.cells)
    },

    onDragStart(event: DragEvent, index: number) {
      const piece = this.cells[index]
      if (!piece || !event.dataTransfer) {
        event.preventDefault()
        return
      }

      this.previewDrop = null
      this.selectedIndex = index
      this.legalMoves = calculateLegalMovesOnBoard(piece, index, this.cells)

      const dragData: BoardDragData = { type: 'MOVE_ON_BOARD', fromIndex: index }
      event.dataTransfer.setData('application/json', JSON.stringify(dragData))
      event.dataTransfer.effectAllowed = 'move'
    },

    onDragEnd() {
      this.isDragOver = -1
      this.clearSelection()
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
      if (!rawData) {
        this.clearSelection()
        return
      }

      const data = JSON.parse(rawData) as DragData

      if (data.type === 'MOVE_ON_BOARD') {
        const fromIndex = data.fromIndex
        const pieceObj = this.cells[fromIndex]
        if (!pieceObj) {
          this.clearSelection()
          return
        }

        const legal = calculateLegalMovesOnBoard(pieceObj, fromIndex, this.cells)
        if (!legal.includes(targetIndex)) {
          this.clearSelection()
          return
        }

        const payload: PieceMovePayload = {
          from: fromIndex,
          to: targetIndex,
          piece: pieceObj,
        }
        this.clearSelection()
        this.$emit('piece-move', payload)
        return
      }

      if (data.type === 'DROP_FROM_KOMADAI') {
        if (this.cells[targetIndex]) {
          this.clearSelection()
          return
        }

        const legalDrops = calculateLegalDrops(data.piece.type, data.owner, this.cells)
        if (!legalDrops.includes(targetIndex)) {
          this.clearSelection()
          return
        }

        const payload: PieceDropPayload = {
          pieceType: data.piece.type,
          to: targetIndex,
          owner: data.owner,
        }
        this.clearSelection()
        this.$emit('piece-drop', payload)
      }
    },

    handleCellClick(index: number) {
      if (this.previewDrop) {
        this.clearSelection()
        const payload: CellClickPayload = { index, cell: this.cells[index] ?? null }
        this.$emit('cell-click', payload)
        if (this.onBoardAction) this.onBoardAction('click', payload)
        return
      }

      if (this.selectedIndex === index) {
        this.clearSelection()
      } else {
        this.selectedIndex = index
        const piece = this.cells[index] ?? null
        this.legalMoves = piece ? calculateLegalMovesOnBoard(piece, index, this.cells) : []
      }

      const payload: CellClickPayload = { index, cell: this.cells[index] ?? null }
      this.$emit('cell-click', payload)
      if (this.onBoardAction) this.onBoardAction('click', payload)
    },
  },
})
</script>

<style scoped lang="scss">
@use '@/styles/design.scss' as *;

.shogi-board {
  padding: $space-md;
  background: $board-bg;
  border: 4px solid $board-line;
  border-radius: $radius-lg;
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

  @media (max-width: $breakpoint-md) {
    width: 315px;
    height: 315px;
  }
}

.board-cell {
  width: calc(100% / 9);
  height: calc(100% / 9);
  border-left: 1px solid $board-line;
  border-top: 1px solid $board-line;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  transition: background $transition-fast;

  &.selected {
    background: rgba(255, 255, 255, 0.25);
  }

  &.legal-move {
    background: rgba($accent-success, 0.25);
    cursor: pointer;

    &:hover {
      background: rgba($accent-success, 0.4);
    }
  }

  &.drag-target {
    background: rgba($accent-warning, 0.3);
  }
}

.legal-marker {
  width: 12px;
  height: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: $radius-full;
  pointer-events: none;
}
</style>
