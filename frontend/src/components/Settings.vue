<!-- src/components/Settings.vue -->
<script lang="ts">
import { defineComponent } from 'vue'
import {
  SETTINGS_DEFAULTS,
  TEXT_LANGUAGES,
  isTextLanguage,
  settingsStore,
  type CoachProfile,
  type SettingsState,
  type TextLanguage,
} from '@/schemes/settings'
import {
  YANEURAOU_OPTION_DEFS,
  type YaneuraOuOptionDef,
  type YaneuraOuParam,
} from '@/schemes/yaneuraOuParam'
import { isNonEmptyString } from '@/utils/typeGuards'

type Data = {
  state: SettingsState
  apiKeyInput: string
  apiKeyPresent: boolean
  saveMessage: string
  coaches: readonly CoachProfile[]
  llmOpen: boolean
  languageOpen: boolean
  coachOpen: boolean
  engineOpen: boolean
}

export default defineComponent({
  name: 'SettingsPanel',

  data(): Data {
    return {
      state: settingsStore.getState(),
      apiKeyInput: '',
      apiKeyPresent: settingsStore.getLLMApiKey() !== null,
      saveMessage: '',
      coaches: settingsStore.getCoaches(),
      llmOpen: false,
      languageOpen: false,
      coachOpen: true,
      engineOpen: false,
    }
  },

  computed: {
    textLanguages(): readonly TextLanguage[] {
      return TEXT_LANGUAGES
    },

    selectedCoach(): CoachProfile | null {
      return settingsStore.getCoachById(this.state.coachId)
    },

    yaneuraOuOptionDefs(): readonly YaneuraOuOptionDef[] {
      return YANEURAOU_OPTION_DEFS
    },
  },

  mounted() {
    const unsub = settingsStore.subscribe((s) => {
      this.state = s
      this.apiKeyPresent = settingsStore.getLLMApiKey() !== null
    })
    ;(this as unknown as { _unsubSettings?: () => void })._unsubSettings = unsub
  },

  beforeUnmount() {
    const self = this as unknown as { _unsubSettings?: () => void }
    if (self._unsubSettings) self._unsubSettings()
  },

  methods: {
    onChangeBaseUrl(v: string) {
      if (!isNonEmptyString(v)) return
      settingsStore.update({ llmBaseUrl: v.trim() })
      this.flash('Saved.')
    },

    onChangeModelName(v: string) {
      if (!isNonEmptyString(v)) return
      settingsStore.update({ llmModelName: v.trim() })
      this.flash('Saved.')
    },

    onChangeTextLanguage(v: string) {
      if (!isTextLanguage(v)) return
      settingsStore.update({ textLanguage: v })
      this.flash('Saved.')
    },

    onChangeAudioLanguage(v: string) {
      if (!isTextLanguage(v)) return
      settingsStore.update({ audioLanguage: v })
      this.flash('Saved.')
    },

    onChangeCoachId(v: string) {
      if (!isNonEmptyString(v)) return
      const coach = settingsStore.getCoachById(v.trim())
      if (!coach) return
      settingsStore.update({ coachId: coach.id })
      this.flash('Saved.')
    },

    saveApiKey() {
      const k = this.apiKeyInput.trim()
      if (k.length === 0) return
      settingsStore.setLLMApiKey(k)
      this.apiKeyInput = ''
      this.apiKeyPresent = true
      this.flash('API Key saved.')
    },

    clearApiKey() {
      settingsStore.clearLLMApiKey()
      this.apiKeyInput = ''
      this.apiKeyPresent = false
      this.flash('API Key cleared.')
    },

    resetDefaults() {
      settingsStore.update({
        llmBaseUrl: SETTINGS_DEFAULTS.baseUrl,
        llmModelName: SETTINGS_DEFAULTS.modelName,
        textLanguage: 'English',
        audioLanguage: 'English',
        coachId: settingsStore.getCoaches()[0]?.id ?? 'calm-sensei',
      })
      this.flash('Reset to defaults.')
    },

    resetEngineDefaults() {
      settingsStore.updateYaneuraOu({})
      this.flash('Engine params normalized.')
    },

    onEngineCheck(name: keyof YaneuraOuParam, checked: boolean) {
      settingsStore.updateYaneuraOu({ [name]: checked } as Partial<YaneuraOuParam>)
      this.flash('Saved.')
    },

    onEngineString(name: keyof YaneuraOuParam, value: string) {
      settingsStore.updateYaneuraOu({ [name]: value } as Partial<YaneuraOuParam>)
      this.flash('Saved.')
    },

    onEngineCombo(def: YaneuraOuOptionDef, value: string) {
      if (def.type !== 'combo') return
      if (!def.vars.includes(value)) return
      const name = def.name as keyof YaneuraOuParam
      settingsStore.updateYaneuraOu({ [name]: value } as Partial<YaneuraOuParam>)
      this.flash('Saved.')
    },

    onEngineSpin(def: YaneuraOuOptionDef, raw: string) {
      if (def.type !== 'spin') return
      const name = def.name as keyof YaneuraOuParam

      if (def.spinKind === 'bigint') {
        settingsStore.updateYaneuraOu({ [name]: raw.trim() } as Partial<YaneuraOuParam>)
        this.flash('Saved.')
        return
      }

      const n = Number(raw)
      if (!Number.isFinite(n)) return
      settingsStore.updateYaneuraOu({ [name]: Math.trunc(n) } as Partial<YaneuraOuParam>)
      this.flash('Saved.')
    },

    flash(msg: string) {
      this.saveMessage = msg
      window.setTimeout(() => {
        if (this.saveMessage === msg) this.saveMessage = ''
      }, 1200)
    },
  },
})
</script>

<template>
  <div class="settings">
    <div v-if="saveMessage" class="toast">{{ saveMessage }}</div>

    <div class="section">
      <button class="section-toggle" type="button" @click="coachOpen = !coachOpen">
        <span>Coach</span>
        <svg
          class="chevron"
          :class="{ open: coachOpen }"
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
      <div v-show="coachOpen" class="section-body">
        <div class="field">
          <label>Select Coach</label>
          <select
            class="input"
            :value="state.coachId"
            @change="onChangeCoachId(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="c in coaches" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>

        <div v-if="selectedCoach" class="coach-preview">
          <img class="avatar" :src="selectedCoach.image" alt="Coach" />
          <div class="coach-info">
            <div class="coach-name">{{ selectedCoach.name }}</div>
            <div class="coach-meta">{{ selectedCoach.language }} · {{ selectedCoach.voice }}</div>
          </div>
        </div>

        <div v-if="selectedCoach" class="field">
          <label>Personality</label>
          <div class="personality-text">{{ selectedCoach.personalityPrompt }}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <button class="section-toggle" type="button" @click="languageOpen = !languageOpen">
        <span>Language</span>
        <svg
          class="chevron"
          :class="{ open: languageOpen }"
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
      <div v-show="languageOpen" class="section-body">
        <div class="field">
          <label>Text Language</label>
          <select
            class="input"
            :value="state.textLanguage"
            @change="onChangeTextLanguage(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="l in textLanguages" :key="l" :value="l">{{ l }}</option>
          </select>
        </div>

        <div class="field">
          <label>Audio Language</label>
          <select
            class="input"
            :value="state.audioLanguage"
            @change="onChangeAudioLanguage(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="l in textLanguages" :key="l" :value="l">{{ l }}</option>
          </select>
        </div>
      </div>
    </div>

    <div class="section">
      <button class="section-toggle" type="button" @click="llmOpen = !llmOpen">
        <span>LLM API</span>
        <svg
          class="chevron"
          :class="{ open: llmOpen }"
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
      <div v-show="llmOpen" class="section-body">
        <div class="field">
          <label>Base URL</label>
          <input
            class="input mono"
            :value="state.llmBaseUrl"
            placeholder="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
            @change="onChangeBaseUrl(($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="field">
          <label>Model Name</label>
          <input
            class="input mono"
            :value="state.llmModelName"
            placeholder="gemini-3-flash-preview"
            @change="onChangeModelName(($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="field">
          <label>API Key</label>
          <div class="key-row">
            <input
              class="input mono"
              type="password"
              v-model="apiKeyInput"
              placeholder="Paste API key"
              autocomplete="off"
            />
            <button class="btn" type="button" @click="saveApiKey">Save</button>
          </div>
          <div class="key-status" :class="{ ok: apiKeyPresent }">
            {{ apiKeyPresent ? '✓ Key present' : '✗ Key missing' }}
          </div>
          <button v-if="apiKeyPresent" class="btn danger" type="button" @click="clearApiKey">
            Clear Key
          </button>
        </div>

        <button class="btn" type="button" @click="resetDefaults">Reset Defaults</button>
      </div>
    </div>

    <div class="section">
      <button class="section-toggle" type="button" @click="engineOpen = !engineOpen">
        <span>YaneuraOu Engine</span>
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
      <div v-show="engineOpen" class="section-body">
        <div class="engine-actions">
          <button class="btn" type="button" @click="resetEngineDefaults">Reset Engine</button>
        </div>

        <div v-for="def in yaneuraOuOptionDefs" :key="def.name" class="field">
          <label class="mono">{{ def.name }}</label>

          <template v-if="def.type === 'check'">
            <label class="switch">
              <input
                type="checkbox"
                :checked="Boolean(state.yaneuraOu[def.name])"
                @change="
                  onEngineCheck(
                    def.name as keyof YaneuraOuParam,
                    ($event.target as HTMLInputElement).checked,
                  )
                "
              />
              <span class="slider"></span>
            </label>
          </template>

          <template v-else-if="def.type === 'string'">
            <input
              class="input mono"
              :value="String(state.yaneuraOu[def.name])"
              @change="
                onEngineString(
                  def.name as keyof YaneuraOuParam,
                  ($event.target as HTMLInputElement).value,
                )
              "
            />
          </template>

          <template v-else-if="def.type === 'combo'">
            <select
              class="input"
              :value="String(state.yaneuraOu[def.name])"
              @change="onEngineCombo(def, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="v in def.vars" :key="v" :value="v">{{ v }}</option>
            </select>
          </template>

          <template v-else>
            <input
              v-if="def.spinKind === 'number'"
              class="input mono"
              type="number"
              :min="Number(def.min)"
              :max="Number(def.max)"
              :value="Number(state.yaneuraOu[def.name])"
              @change="onEngineSpin(def, ($event.target as HTMLInputElement).value)"
            />
            <input
              v-else
              class="input mono"
              :value="String(state.yaneuraOu[def.name])"
              inputmode="numeric"
              pattern="[0-9]*"
              @change="onEngineSpin(def, ($event.target as HTMLInputElement).value)"
            />
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/design.scss' as *;

.settings {
  padding: $space-lg;
  display: flex;
  flex-direction: column;
  gap: $space-md;
}

.toast {
  padding: $space-sm $space-md;
  background: $accent-success;
  color: $text-on-accent;
  border-radius: $radius-md;
  font-size: $text-sm;
  text-align: center;
}

.section {
  background: $bg-elevated;
  border: 1px solid $border-subtle;
  border-radius: $radius-lg;
  overflow: hidden;
}

.section-toggle {
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

.chevron {
  color: $text-muted;
  transition: transform $transition-base;

  &.open {
    transform: rotate(180deg);
  }
}

.section-body {
  padding: $space-lg;
  padding-top: 0;
  display: flex;
  flex-direction: column;
  gap: $space-md;
}

.field {
  display: flex;
  flex-direction: column;
  gap: $space-xs;

  label {
    font-size: $text-sm;
    color: $text-secondary;
  }
}

.input {
  @include input-base;
}

.mono {
  font-family: $font-mono;
}

.btn {
  @include button-base;

  &.danger {
    border-color: $accent-error;
    color: $accent-error;

    &:hover {
      background: rgba($accent-error, 0.1);
    }
  }
}

.coach-preview {
  display: flex;
  align-items: center;
  gap: $space-md;
  padding: $space-md;
  background: $bg-base;
  border-radius: $radius-md;
}

.avatar {
  width: 48px;
  height: 48px;
  border-radius: $radius-md;
  object-fit: cover;
  background: $bg-elevated;
}

.coach-info {
  flex: 1;
  min-width: 0;
}

.coach-name {
  font-weight: 600;
  color: $text-primary;
}

.coach-meta {
  font-size: $text-sm;
  color: $text-muted;
}

.personality-text {
  font-size: $text-sm;
  color: $text-secondary;
  line-height: $line-height-relaxed;
  padding: $space-md;
  background: $bg-base;
  border-radius: $radius-md;
}

.key-row {
  display: flex;
  gap: $space-sm;
}

.key-status {
  font-size: $text-sm;
  color: $accent-error;

  &.ok {
    color: $accent-success;
  }
}

.engine-actions {
  margin-bottom: $space-sm;
}

.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }
}

.slider {
  position: absolute;
  inset: 0;
  background: $bg-base;
  border-radius: $radius-full;
  cursor: pointer;
  transition: background $transition-fast;

  &::before {
    content: '';
    position: absolute;
    width: 18px;
    height: 18px;
    left: 3px;
    bottom: 3px;
    background: $text-muted;
    border-radius: 50%;
    transition:
      transform $transition-fast,
      background $transition-fast;
  }

  input:checked + & {
    background: rgba($accent-primary, 0.3);

    &::before {
      background: $accent-primary;
      transform: translateX(20px);
    }
  }
}
</style>
