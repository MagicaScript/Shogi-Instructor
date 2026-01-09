<script setup lang="ts">
import { ref } from 'vue'
import ShogiGame from './components/ShogiGame.vue'
import YaneuraOuEngine from './components/YaneuraOuEngine.vue'

const syncEnabled = ref(false)
const currentSfen = ref('')

function toggleSync() {
  syncEnabled.value = !syncEnabled.value
}

function handleSfenChange(next: string) {
  currentSfen.value = next
}
</script>

<template>
  <header class="app-header">
    <h1>Vue Shogi App</h1>

    <div class="actions">
      <button class="sync-btn" :class="{ active: syncEnabled }" type="button" @click="toggleSync">
        Sync lishogi
      </button>
      <span class="sync-state" :class="{ on: syncEnabled }">
        {{ syncEnabled ? 'ON' : 'OFF' }}
      </span>
    </div>
  </header>

  <main class="main">
    <div class="left">
      <ShogiGame :sync-enabled="syncEnabled" @sfen-change="handleSfenChange" />
    </div>

    <div class="right">
      <YaneuraOuEngine :sfen="currentSfen" :depth="12" />
    </div>
  </main>
</template>

<style scoped>
/* keep your existing styles; add layout */
.main {
  display: flex;
  justify-content: center;
  gap: 18px;
  align-items: flex-start;
}

.left {
  flex: 0 0 auto;
}

.right {
  flex: 1 1 auto;
}
</style>
