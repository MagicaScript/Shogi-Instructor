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
} from '@/schemes/YaneuraOuParam'

type Data = {
  state: SettingsState
  apiKeyInput: string
  apiKeyPresent: boolean
  saveMessage: string
  coaches: readonly CoachProfile[]
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

export default defineComponent({
  name: 'SettingsPanel',

  data(): Data {
    return {
      state: settingsStore.getState(),
      apiKeyInput: '',
      apiKeyPresent: settingsStore.getGeminiApiKey() !== null,
      saveMessage: '',
      coaches: settingsStore.getCoaches(),
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
      this.apiKeyPresent = settingsStore.getGeminiApiKey() !== null
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
      settingsStore.update({ geminiBaseUrl: v.trim() })
      this.flash('Saved.')
    },

    onChangeModelName(v: string) {
      if (!isNonEmptyString(v)) return
      settingsStore.update({ geminiModelName: v.trim() })
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
      settingsStore.setGeminiApiKey(k)
      this.apiKeyInput = ''
      this.apiKeyPresent = true
      this.flash('API Key saved in cookies.')
    },

    clearApiKey() {
      settingsStore.clearGeminiApiKey()
      this.apiKeyInput = ''
      this.apiKeyPresent = false
      this.flash('API Key cleared.')
    },

    resetDefaults() {
      settingsStore.update({
        geminiBaseUrl: SETTINGS_DEFAULTS.baseUrl,
        geminiModelName: SETTINGS_DEFAULTS.modelName,
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
  <section class="settings">
    <header class="head">
      <div>
        <h2>Settings</h2>
        <div class="hint">Gemini config, coach preferences, and engine parameters.</div>
      </div>
      <button class="btn" type="button" @click="resetDefaults">Reset</button>
    </header>

    <div class="grid">
      <div class="card">
        <h3>Gemini API</h3>

        <div class="row">
          <label>Base URL</label>
          <input
            class="input mono"
            :value="state.geminiBaseUrl"
            placeholder="https://generativelanguage.googleapis.com"
            @change="onChangeBaseUrl(($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="row">
          <label>Model Name</label>
          <input
            class="input mono"
            :value="state.geminiModelName"
            placeholder="gemini-3-flash-preview"
            @change="onChangeModelName(($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="row">
          <label>API Key (Cookie)</label>
          <div class="inline">
            <input
              class="input mono"
              type="password"
              v-model="apiKeyInput"
              placeholder="Paste API key here"
              autocomplete="off"
            />
            <button class="btn" type="button" @click="saveApiKey">Save</button>
            <button class="btn danger" type="button" @click="clearApiKey">Clear</button>
          </div>
          <div class="small">
            Status:
            <span :class="apiKeyPresent ? 'ok' : 'bad'">
              {{ apiKeyPresent ? 'Key present' : 'Key missing' }}
            </span>
          </div>
        </div>

        <div v-if="saveMessage" class="toast">{{ saveMessage }}</div>
      </div>

      <div class="card">
        <h3>Language</h3>

        <div class="row">
          <label>Text Language</label>
          <select
            class="input"
            :value="state.textLanguage"
            @change="onChangeTextLanguage(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="l in textLanguages" :key="l" :value="l">{{ l }}</option>
          </select>
        </div>

        <div class="row">
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

      <div class="card">
        <h3>Coach</h3>

        <div class="row">
          <label>Select Coach</label>
          <select
            class="input"
            :value="state.coachId"
            @change="onChangeCoachId(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="c in coaches" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>

        <div v-if="selectedCoach" class="coachPreview">
          <img class="avatar" :src="selectedCoach.image" alt="Coach image" />
          <div class="coachMeta">
            <div class="coachName">{{ selectedCoach.name }}</div>
            <div class="small mono">id: {{ selectedCoach.id }}</div>
            <div class="small">
              voice: <span class="mono">{{ selectedCoach.voice }}</span>
            </div>
            <div class="small">
              default language: <span class="mono">{{ selectedCoach.language }}</span>
            </div>
          </div>
        </div>

        <div v-if="selectedCoach" class="row">
          <label>Personality Prompt</label>
          <textarea class="input mono area" :value="selectedCoach.personalityPrompt" readonly />
          <div class="small">
            Edit personality in code (default coach list) or extend the store later.
          </div>
        </div>
      </div>

      <div class="card">
        <header class="engineHead">
          <div>
            <h3>YaneuraOu</h3>
            <div class="small">Applied via USI setoption and engine will reset automatically.</div>
          </div>
          <button class="btn" type="button" @click="resetEngineDefaults">Normalize</button>
        </header>

        <div v-for="def in yaneuraOuOptionDefs" :key="def.name" class="row">
          <label class="mono">{{ def.name }}</label>

          <template v-if="def.type === 'check'">
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
  </section>
</template>

<style scoped>
.settings {
  width: 980px;
  max-width: calc(100vw - 48px);
  margin-top: 14px;
  border: 1px solid #ddd;
  border-radius: 14px;
  background: #fff;
  padding: 14px 16px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.hint {
  margin-top: 2px;
  color: #666;
  font-size: 12px;
}

.grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

@media (min-width: 980px) {
  .grid {
    grid-template-columns: 1.2fr 0.8fr;
  }
}

.card {
  border: 1px solid #eee;
  border-radius: 12px;
  padding: 12px;
  background: #fafafa;
}

.row {
  margin-top: 10px;
  display: grid;
  gap: 6px;
}

label {
  font-size: 12px;
  color: #555;
}

.input {
  width: 100%;
  border: 1px solid #ddd;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
  background: #fff;
}

.area {
  min-height: 84px;
  resize: vertical;
}

.inline {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn {
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.btn:hover {
  background: #f3f3f3;
}

.btn.danger {
  border-color: #f0c0c0;
  color: #9a1a1a;
}

.small {
  font-size: 12px;
  color: #666;
}

.ok {
  color: #167a3a;
}

.bad {
  color: #b00020;
}

.toast {
  margin-top: 10px;
  font-size: 12px;
  color: #111;
}

.coachPreview {
  margin-top: 10px;
  display: flex;
  gap: 10px;
  align-items: center;
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid #eee;
  object-fit: cover;
  background: #fff;
}

.coachName {
  font-weight: 600;
  font-size: 13px;
}

.mono {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
}

.engineHead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
</style>
