<script setup lang="ts">
import { ref } from 'vue'
import ShogiGame from './components/ShogiGame.vue'
import YaneuraOuEngine from './components/YaneuraOuEngine.vue'
import BotCoach from './components/BotCoach.vue'
import SettingsPanel from './components/Settings.vue'
import type { EngineAnalysisPayload } from '@/schemes/engineAnalysis'
import { isEngineAnalysisPayload } from '@/schemes/engineAnalysis'
import type { GameInfo } from '@/schemes/gameInfo'
import { isGameInfo } from '@/schemes/gameInfo'

const syncEnabled = ref(false)
const currentSfen = ref('')
const engineAnalysis = ref<EngineAnalysisPayload | null>(null)
const gameInfo = ref<GameInfo | null>(null)

function toggleSync() {
  syncEnabled.value = !syncEnabled.value
}

function handleSfenChange(next: string) {
  currentSfen.value = next
}

function handleGameInfoChange(next: GameInfo) {
  if (!isGameInfo(next)) return
  gameInfo.value = next
  currentSfen.value = next.sfen
}

function handleEngineAnalysisUpdate(payload: EngineAnalysisPayload) {
  if (!isEngineAnalysisPayload(payload)) return
  engineAnalysis.value = payload
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
      <ShogiGame
        :sync-enabled="syncEnabled"
        @sfen-change="handleSfenChange"
        @game-info-change="handleGameInfoChange"
      />
    </div>

    <div class="right">
      <SettingsPanel />

      <YaneuraOuEngine
        :sfen="currentSfen"
        :depth="18"
        @analysis-update="handleEngineAnalysisUpdate"
      />

      <BotCoach :analysis="engineAnalysis" :game-info="gameInfo" />
    </div>
  </main>
</template>

<style scoped>
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
  display: grid;
  gap: 12px;
}
</style>
