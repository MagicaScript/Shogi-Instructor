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
        <span v-if="piece.count > 1" class="piece-count">{{ piece.count }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue'
import ShogiPiece from './ShogiPiece.vue'
import type { PlayerOwner, PieceType } from '@/logic/shogiPiece'
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
@use '@/styles/design.scss' as *;

.shogi-komadai {
  background: $komadai-bg;
  border: 3px solid $komadai-border;
  border-radius: $radius-lg;
  padding: $space-md;
  width: 450px;
  min-height: auto;
  display: flex;
  flex-direction: column;

  &.is-top {
    order: -1;
  }

  @media (max-width: $breakpoint-md) {
    width: 315px;
    padding: $space-sm;
  }
}

.komadai-header {
  text-align: center;
  font-weight: 600;
  font-size: $text-sm;
  margin-bottom: $space-sm;
  color: $board-line;
}

.komadai-grid {
  display: flex;
  flex-wrap: wrap;
  gap: $space-xs;
  justify-content: center;
  align-content: flex-start;
}

.komadai-cell {
  width: 36px;
  height: 40px;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: grab;
  transition: transform $transition-fast;

  &:hover {
    transform: scale(1.08);
  }

  &:active {
    cursor: grabbing;
  }

  @media (max-width: $breakpoint-md) {
    width: 30px;
    height: 34px;
  }
}

.piece-count {
  position: absolute;
  bottom: -4px;
  right: -4px;
  background: $bg-elevated;
  color: $text-primary;
  border-radius: $radius-full;
  padding: 1px 5px;
  font-size: $text-xs;
  font-weight: 600;
  border: 1px solid $border-default;
}
</style>
