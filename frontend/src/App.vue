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
import type { MoveHistoryEntry } from '@/schemes/moveHistory'

const syncEnabled = ref(false)
const currentSfen = ref('')
const engineAnalysis = ref<EngineAnalysisPayload | null>(null)
const gameInfo = ref<GameInfo | null>(null)
const moveHistory = ref<MoveHistoryEntry[]>([])

const settingsOpen = ref(false)
const engineOpen = ref(false)
const boardOpen = ref(true)

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

function handleMoveHistoryChange(history: MoveHistoryEntry[]) {
  moveHistory.value = history
}

function closeSettings() {
  settingsOpen.value = false
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <h1 class="app-title">
        <span class="app-title-text">Shogi Instructor</span>
        <span class="beta-badge" aria-label="Beta">Beta</span>
      </h1>

      <div class="header-actions">
        <button class="sync-btn" :class="{ active: syncEnabled }" type="button" @click="toggleSync">
          <span class="sync-dot" :class="{ on: syncEnabled }"></span>
          <span>{{ syncEnabled ? 'Syncing' : 'Sync' }}</span>
        </button>

        <button
          class="icon-btn"
          type="button"
          title="Settings"
          @click="settingsOpen = !settingsOpen"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path
              d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
            />
          </svg>
        </button>
      </div>
    </header>

    <main class="main-content">
      <div class="top-row">
        <section class="panel board-panel" :class="{ collapsed: !boardOpen }">
          <button class="panel-toggle" type="button" @click="boardOpen = !boardOpen">
            <span class="panel-title">Board</span>
            <svg
              class="chevron"
              :class="{ open: boardOpen }"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <div v-show="boardOpen" class="panel-body">
            <ShogiGame
              :sync-enabled="syncEnabled"
              @sfen-change="handleSfenChange"
              @game-info-change="handleGameInfoChange"
              @move-history-change="handleMoveHistoryChange"
            />
          </div>
        </section>

        <section class="panel coach-panel">
          <BotCoach :analysis="engineAnalysis" :game-info="gameInfo" :move-history="moveHistory" />
        </section>
      </div>

      <section class="panel engine-panel" :class="{ collapsed: !engineOpen }">
        <button class="panel-toggle" type="button" @click="engineOpen = !engineOpen">
          <span class="panel-title">Engine</span>
          <svg
            class="chevron"
            :class="{ open: engineOpen }"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div v-show="engineOpen" class="panel-body">
          <YaneuraOuEngine :sfen="currentSfen" @analysis-update="handleEngineAnalysisUpdate" />
        </div>
      </section>
    </main>

    <div v-if="settingsOpen" class="settings-backdrop" @click="closeSettings"></div>
    <aside class="settings-drawer" :class="{ open: settingsOpen }">
      <header class="drawer-header">
        <h2>Settings</h2>
        <button class="icon-btn" type="button" @click="closeSettings">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>
      <div class="drawer-body">
        <SettingsPanel />
      </div>
    </aside>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/design.scss' as *;

.app-shell {
  min-height: 100vh;
  background: $bg-base;
  color: $text-primary;
  font-family: $font-sans;
  display: flex;
  flex-direction: column;
}

.app-header {
  position: sticky;
  top: 0;
  z-index: $z-sticky;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $space-md $space-lg;
  background: $bg-surface;
  border-bottom: 1px solid $border-subtle;
}

.app-title {
  font-size: $text-lg;
  font-weight: 600;
  color: $text-primary;
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: $space-sm;
}

.beta-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: $radius-full;
  background: $accent-success;
  color: $text-on-accent;
  font-size: $text-xs;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  line-height: 1.2;
  border: 1px solid $accent-success;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: $space-md;
}

.sync-btn {
  @include button-base;
  gap: $space-sm;

  &.active {
    border-color: $accent-success;
    color: $accent-success;
  }
}

.sync-dot {
  width: 8px;
  height: 8px;
  border-radius: $radius-full;
  background: $text-muted;
  transition: background $transition-fast;

  &.on {
    background: $accent-success;
    box-shadow: 0 0 8px $accent-success;
  }
}

.icon-btn {
  @include button-base;
  padding: $space-sm;
  border-radius: $radius-md;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: $space-md;
  padding: $space-lg;
  max-width: $content-max-width;
  margin: 0 auto;
  width: 100%;
  align-items: stretch;
}

.top-row {
  display: flex;
  flex-direction: column;
  gap: $space-md;

  @media (min-width: $breakpoint-lg) {
    flex-direction: row;
    align-items: stretch;
  }
}

.panel {
  @include card;
  overflow: hidden;
}

.panel-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: $space-md $space-lg;
  background: transparent;
  border: none;
  color: $text-primary;
  font-size: $text-base;
  font-weight: 500;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover {
    background: $bg-hover;
  }
}

.panel-title {
  color: $text-secondary;
}

.chevron {
  transition: transform $transition-base;

  &.open {
    transform: rotate(180deg);
  }
}

.panel-body {
  padding: $space-lg;
  border-top: 1px solid $border-subtle;
}

.board-panel {
  @media (min-width: $breakpoint-lg) {
    flex: 1 1 55%;
    min-width: 0;
  }
}

.coach-panel {
  @media (min-width: $breakpoint-lg) {
    flex: 1 1 45%;
    min-width: 0;
  }
}

.engine-panel {
  width: 100%;
}

.settings-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: $z-modal-backdrop;
}

.settings-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  max-width: 420px;
  background: $bg-surface;
  border-left: 1px solid $border-subtle;
  z-index: $z-modal;
  transform: translateX(100%);
  transition: transform $transition-slow;
  display: flex;
  flex-direction: column;

  &.open {
    transform: translateX(0);
  }
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $space-lg;
  border-bottom: 1px solid $border-subtle;

  h2 {
    font-size: $text-lg;
    font-weight: 600;
    margin: 0;
  }
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  @include scrollbar;
}
</style>
