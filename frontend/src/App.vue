<script setup lang="ts">
import { ref } from 'vue'
import ShogiGame from './components/ShogiGame.vue'

const syncEnabled = ref(false)

function toggleSync() {
  syncEnabled.value = !syncEnabled.value
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

  <main>
    <ShogiGame :sync-enabled="syncEnabled" />
  </main>
</template>

<style scoped>
.app-header {
  text-align: center;
  margin-bottom: 2rem;
}

h1 {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  color: #333;
}

.actions {
  margin-top: 0.75rem;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.sync-btn {
  border: 1px solid #ccc;
  background: #fff;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
}

.sync-btn.active {
  border-color: #666;
}

.sync-state {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  font-size: 12px;
  color: #666;
}

.sync-state.on {
  color: #111;
}

main {
  display: flex;
  justify-content: center;
}
</style>
