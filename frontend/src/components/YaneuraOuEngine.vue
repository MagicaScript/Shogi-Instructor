<script lang="ts">
import { defineComponent } from 'vue'
import { YaneuraOuEngineQueue } from '@/logic/yaneuraOuEngineQueue'
import type { AnalyzeResult, AnalyzeStaticParams, UsiInfo } from '@/logic/yaneuraOuEngine'
import type { EngineAnalysisPayload } from '@/schemes/engineAnalysis'
import { isEngineAnalysisPayload } from '@/schemes/engineAnalysis'
import { normalizeScore } from '@/schemes/usi'
import { settingsStore } from '@/schemes/settings'

type EngineStatus = 'idle' | 'loading' | 'ready' | 'analyzing' | 'error'

type Data = {
  engine: YaneuraOuEngineQueue
  analysisDefaults: AnalyzeStaticParams
  status: EngineStatus
  errorMsg: string
  result: AnalyzeResult | null
  lastInfo: UsiInfo | null
  logLines: string[]
  cancelLogListener: (() => void) | null
  cancelSettingsSub: (() => void) | null
  cancelEngineReset: (() => void) | null
  lastSfenAnalyzed: string
  lastSfenQueued: string
  cancelInfoTap: (() => void) | null
  logsOpen: boolean
}

export default defineComponent({
  name: 'YaneuraOuEngineCard',

  props: {
    sfen: { type: String, required: true },
  },

  emits: {
    'analysis-update': (payload: EngineAnalysisPayload) => isEngineAnalysisPayload(payload),
  },

  data(): Data {
    return {
      engine: new YaneuraOuEngineQueue(),
      analysisDefaults: { ...settingsStore.getState().yaneuraOuAnalyze },
      status: 'idle',
      errorMsg: '',
      result: null,
      lastInfo: null,
      logLines: [],
      cancelLogListener: null,
      cancelSettingsSub: null,
      cancelEngineReset: null,
      lastSfenAnalyzed: '',
      lastSfenQueued: '',
      cancelInfoTap: null,
      logsOpen: false,
    }
  },

  computed: {
    canAnalyze(): boolean {
      return this.sfen.trim().length > 0 && this.status === 'ready'
    },

    prettyScore(): string {
      const info = this.lastInfo
      const score = info?.score
      if (!score || score.type === 'none') return ''
      if (score.type === 'cp') return `cp ${score.value}`
      if (score.value === 'unknown') return 'mate ?'
      return `mate ${score.value}`
    },
  },

  watch: {
    sfen: {
      immediate: true,
      handler(next: string) {
        void this.runAnalysis(next)
      },
    },
  },

  mounted() {
    void this.initEngine()
    this.cancelSettingsSub?.()
    this.cancelSettingsSub = settingsStore.subscribe((s) => {
      this.analysisDefaults = { ...s.yaneuraOuAnalyze }
    })
    this.cancelEngineReset?.()
    this.cancelEngineReset = settingsStore.onEngineReset(() => {
      void this.resetEngineRuntime()
    })
  },

  beforeUnmount() {
    this.cancelEngineReset?.()
    this.cancelEngineReset = null

    this.cancelSettingsSub?.()
    this.cancelSettingsSub = null

    this.cancelInfoTap?.()
    this.cancelInfoTap = null

    this.cancelLogListener?.()
    this.cancelLogListener = null

    void this.engine.dispose()
  },

  methods: {
    pushLog(line: string) {
      this.logLines.push(line)
      if (this.logLines.length > 300) this.logLines.splice(0, this.logLines.length - 300)
    },

    async initEngine() {
      this.status = 'loading'
      this.errorMsg = ''
      this.logLines = []
      this.result = null
      this.lastInfo = null
      this.lastSfenAnalyzed = ''
      this.lastSfenQueued = ''

      try {
        this.cancelLogListener?.()
        this.cancelLogListener = this.engine.onLine((line: string) => {
          this.pushLog(line)
        })

        await this.engine.init()
        this.status = 'ready'
      } catch (e: unknown) {
        this.status = 'error'
        this.errorMsg = e instanceof Error ? e.message : String(e)
      }
    },

    async resetEngineRuntime() {
      try {
        await this.engine.dispose()
      } catch {
        // ignore
      }
      this.engine = new YaneuraOuEngineQueue()
      await this.initEngine()
    },

    async runAnalysis(sfen: string) {
      const trimmed = sfen.trim()
      if (trimmed.length === 0) return
      if (this.status !== 'ready' && this.status !== 'analyzing') return
      if (trimmed === this.lastSfenAnalyzed) return
      if (trimmed === this.lastSfenQueued) return

      this.lastSfenQueued = trimmed
      this.status = 'analyzing'
      this.errorMsg = ''
      this.result = null
      this.lastInfo = null
      this.logLines = []

      this.cancelInfoTap?.()
      this.cancelInfoTap = this.engine.onLine((line: string) => {
        if (!line.startsWith('info ')) return
        const rawInfo: UsiInfo = { raw: line }
        this.lastInfo = rawInfo
      })

      const { depth, movetimeMs } = this.analysisDefaults

      try {
        const r = await this.engine.enqueueAnalysis({
          sfen: trimmed,
          depth,
          movetimeMs,
        })

        this.result = r
        this.lastInfo = r.lastInfo ?? null
        this.lastSfenAnalyzed = trimmed
        if (trimmed === this.lastSfenQueued) this.status = 'ready'

        const payload: EngineAnalysisPayload = {
          sfen: trimmed,
          bestmove: r.bestmove ?? null,
          ponder: r.ponder ?? null,
          score: normalizeScore(r.lastInfo?.score),
          pv: r.lastInfo?.pv ? [...r.lastInfo.pv] : [],
          isOnlyMove: r.isOnlyMove,
        }

        this.$emit('analysis-update', payload)
      } catch (e: unknown) {
        this.status = 'error'
        this.errorMsg = e instanceof Error ? e.message : String(e)
      } finally {
        this.cancelInfoTap?.()
        this.cancelInfoTap = null
      }
    },
  },
})
</script>

<template>
  <div class="engine-card">
    <header class="engine-header">
      <h3>YaneuraOu</h3>
      <span class="badge" :class="status">{{ status }}</span>
    </header>

    <div v-if="errorMsg" class="error">{{ errorMsg }}</div>

    <div class="engine-body">
      <div class="info-row">
        <span class="info-label">Bestmove</span>
        <span class="info-value mono">{{ result?.bestmove ?? '-' }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Score</span>
        <span class="info-value mono">{{ prettyScore || '-' }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">PV</span>
        <span class="info-value mono pv">
          {{ result?.lastInfo?.pv?.length ? result.lastInfo.pv.join(' ') : '-' }}
        </span>
      </div>

      <div class="logs-section">
        <button class="logs-toggle" type="button" @click="logsOpen = !logsOpen">
          {{ logsOpen ? 'Hide' : 'Show' }} logs ({{ logLines.length }})
        </button>
        <div v-if="logsOpen" class="logs mono">
          <div v-for="(l, i) in logLines" :key="i" class="log-line">{{ l }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/design.scss' as *;

.engine-card {
  @include card-elevated;
  padding: $space-md;
}

.engine-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-md;

  h3 {
    font-size: $text-base;
    font-weight: 600;
    margin: 0;
    color: $text-primary;
  }
}

.badge {
  font-family: $font-mono;
  font-size: $text-xs;
  padding: 2px $space-sm;
  border-radius: $radius-full;
  border: 1px solid $border-default;
  color: $text-secondary;
  text-transform: uppercase;

  &.ready {
    border-color: $accent-success;
    color: $accent-success;
  }

  &.analyzing {
    border-color: $accent-primary;
    color: $accent-primary;
  }

  &.error {
    border-color: $accent-error;
    color: $accent-error;
  }
}

.error {
  margin-top: $space-sm;
  font-size: $text-sm;
  color: $accent-error;
}

.engine-body {
  margin-top: $space-md;
  display: flex;
  flex-direction: column;
  gap: $space-sm;
}

.info-row {
  display: flex;
  gap: $space-md;
  align-items: flex-start;
}

.info-label {
  flex: 0 0 70px;
  font-size: $text-sm;
  color: $text-muted;
}

.info-value {
  flex: 1;
  font-size: $text-sm;
  color: $text-primary;

  &.pv {
    word-break: break-all;
  }
}

.mono {
  font-family: $font-mono;
}

.logs-section {
  margin-top: $space-sm;
}

.logs-toggle {
  @include button-base;
  font-size: $text-sm;
  padding: $space-xs $space-md;
}

.logs {
  margin-top: $space-sm;
  max-height: 200px;
  overflow-y: auto;
  background: $bg-base;
  border-radius: $radius-md;
  padding: $space-sm $space-md;
  font-size: $text-xs;
  line-height: $line-height-normal;
  @include scrollbar;
}

.log-line {
  color: $text-secondary;

  &:hover {
    color: $text-primary;
  }
}
</style>
