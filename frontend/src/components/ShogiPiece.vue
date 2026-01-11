<template>
  <div
    class="shogi-piece"
    :class="{ 'is-opponent': isOpponent, 'is-promoted': isPromoted }"
    :style="pieceStyle"
    @click="onClick"
  >
    <span class="piece-label">{{ label }}</span>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

function getScaleByLabel(label: string): number {
  if (label === '王' || label === '角' || label === '馬' || label === '飛' || label === '龍')
    return 1
  if (label === '金' || label === '銀' || label === '成銀') return 0.94
  if (label === '桂' || label === '成桂' || label === '香' || label === '成香') return 0.9
  if (label === '歩' || label === 'と') return 0.86
  return 1
}

export default defineComponent({
  name: 'ShogiPiece',
  props: {
    label: { type: String, required: true },
    isOpponent: { type: Boolean, default: false },
    isPromoted: { type: Boolean, default: false },
  },
  emits: ['click'],
  computed: {
    pieceStyle(): Record<string, string> {
      const scale = getScaleByLabel(this.label)
      const rotate = this.isOpponent ? '180deg' : '0deg'
      return { '--piece-scale': String(scale), '--piece-rotate': rotate }
    },
  },
  methods: {
    onClick(e: MouseEvent) {
      this.$emit('click', e)
    },
  },
})
</script>

<style scoped lang="scss">
@use '@/styles/design.scss' as *;

.shogi-piece {
  width: 90%;
  height: 90%;
  background: $piece-bg;
  color: $piece-text;
  display: flex;
  align-items: center;
  justify-content: center;
  clip-path: polygon(50% 0%, 83% 15%, 95% 100%, 5% 100%, 17% 15%);
  box-shadow: $shadow-sm;
  font-weight: 700;
  font-size: 1.15em;
  transition:
    transform $transition-fast,
    box-shadow $transition-fast;
  transform: rotate(var(--piece-rotate, 0deg)) scale(var(--piece-scale, 1));
  cursor: grab;
  user-select: none;

  &.is-promoted {
    color: $piece-promoted;
  }

  &:hover {
    box-shadow: $shadow-md;
    transform: rotate(var(--piece-rotate, 0deg)) scale(calc(var(--piece-scale, 1) * 1.05));
  }

  &:active {
    cursor: grabbing;
  }
}

.piece-label {
  pointer-events: none;
}
</style>
