<template>
  <div
    class="shogi-piece"
    :class="{ 'is-opponent': isOpponent, 'is-promoted': isPromoted }"
    @click="onClick"
  >
    <!-- Placeholder for piece content -->
    <span class="piece-label">{{ label }}</span>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

/**
 * Component representing a single Shogi piece.
 * Now supports visual cues for dragging.
 */
export default defineComponent({
  name: 'ShogiPiece',
  props: {
    label: { type: String, required: true },
    isOpponent: { type: Boolean, default: false },
    isPromoted: { type: Boolean, default: false },
  },
  emits: ['click'],
  methods: {
    onClick(e: MouseEvent) {
      this.$emit('click', e)
    },
  },
})
</script>

<style scoped lang="scss">
@use '@/styles/colors.scss' as *;

.shogi-piece {
  width: 90%;
  height: 90%;
  background-color: $piece-bg;
  color: $piece-text;

  display: flex;
  align-items: center;
  justify-content: center;

  clip-path: polygon(50% 0%, 100% 15%, 85% 100%, 15% 100%, 0% 15%);
  box-shadow: 2px 2px 2px $piece-shadow;
  font-weight: bold;
  font-size: 1.2em;
  transition: transform 0.2s;

  // Set cursor to indicate draggable items
  cursor: grab;

  &.is-opponent {
    transform: rotate(180deg);
  }

  &.is-promoted {
    color: red;
  }

  &:active {
    cursor: grabbing;
  }
}
</style>
