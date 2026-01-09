<template>
  <div class="shogi-komadai" :class="{ 'is-top': isOpponent }">
    <div class="komadai-header">
      {{ isOpponent ? 'Opponent' : 'You' }}
    </div>

    <div class="komadai-grid">
      <div
        v-for="piece in pieces"
        :key="piece.type"
        class="komadai-cell"
        draggable="true"
        @dragstart="onDragStart($event, piece)"
        @dragend="onDragEnd"
        @click="selectPiece(piece)"
      >
        <ShogiPiece :label="piece.label" :is-opponent="isOpponent" />
        <span v-if="piece.count > 1" class="piece-count">x{{ piece.count }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue'
import ShogiPiece from './ShogiPiece.vue'
import type { PlayerOwner, PieceType } from '@/logic/ShogiPiece'
import type { KomadaiDragData } from './ShogiBoard.vue'

export interface KomadaiPiece {
  label: string
  count: number
  type: PieceType
}

export interface PieceSelectedPayload {
  piece: KomadaiPiece
  owner: PlayerOwner
}

/**
 * ShogiKomadai (Piece Stand) Component.
 */
export default defineComponent({
  name: 'ShogiKomadai',
  components: { ShogiPiece },
  props: {
    pieces: {
      type: Array as PropType<KomadaiPiece[]>,
      default: () => [],
    },
    isOpponent: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['piece-selected', 'komadai-drag-start', 'komadai-drag-end'],
  computed: {
    currentOwner(): PlayerOwner {
      return this.isOpponent ? 'opponent' : 'self'
    },
  },
  methods: {
    selectPiece(piece: KomadaiPiece) {
      const payload: PieceSelectedPayload = { piece, owner: this.currentOwner }
      this.$emit('piece-selected', payload)
      // also allow click-to-preview drop targets
      this.$emit('komadai-drag-start', payload)
    },

    onDragStart(event: DragEvent, piece: KomadaiPiece) {
      if (!event.dataTransfer) return

      event.dataTransfer.effectAllowed = 'copy'

      const dragData: KomadaiDragData = {
        type: 'DROP_FROM_KOMADAI',
        piece,
        owner: this.currentOwner,
      }
      event.dataTransfer.setData('application/json', JSON.stringify(dragData))

      const payload: PieceSelectedPayload = { piece, owner: this.currentOwner }
      this.$emit('komadai-drag-start', payload)
    },

    onDragEnd() {
      this.$emit('komadai-drag-end')
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles/colors.scss';

.shogi-komadai {
  background-color: $komadai-bg;
  border: 4px solid $komadai-border;
  padding: 10px;
  width: 120px;
  min-height: 300px;
  display: flex;
  flex-direction: column;

  &.is-top {
    order: -1;
  }
}

.komadai-header {
  text-align: center;
  font-weight: bold;
  margin-bottom: 10px;
  color: $board-line;
}

.komadai-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  justify-content: center;
}

.komadai-cell {
  width: 40px;
  height: 45px;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: grab;
}

.piece-count {
  position: absolute;
  bottom: -5px;
  right: -5px;
  background: white;
  border-radius: 50%;
  padding: 2px 4px;
  font-size: 0.7em;
  border: 1px solid #333;
}
</style>
