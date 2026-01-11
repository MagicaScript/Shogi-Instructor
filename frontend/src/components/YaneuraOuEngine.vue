<script lang="ts">
import { defineComponent } from 'vue'
import { YaneuraOuEngine, type AnalyzeResult, type UsiInfo } from '@/logic/yaneuraOuEngine'
import type { EngineAnalysisPayload } from '@/schemes/engineAnalysis'
import { isEngineAnalysisPayload } from '@/schemes/engineAnalysis'
import { normalizeUsiScore } from '@/schemes/usi'

type EngineStatus = 'idle' | 'loading' | 'ready' | 'analyzing' | 'error'

type Data = {
  engine: YaneuraOuEngine
  status: EngineStatus
  errorMsg: string
  result: AnalyzeResult | null
  lastInfo: UsiInfo | null
  logLines: string[]
  cancelLogListener: (() => void) | null
  lastSfenAnalyzed: string
  cancelInfoTap: (() => void) | null
  logsOpen: boolean
}

export default defineComponent({
  name: 'YaneuraOuEngineCard',

  props: {
    sfen: { type: String, required: true },
    depth: { type: Number, default: 18 },
    movetimeMs: { type: Number, default: undefined },
  },

  emits: {
    'analysis-update': (payload: EngineAnalysisPayload) => isEngineAnalysisPayload(payload),
  },

  data(): Data {
    return {
      engine: new YaneuraOuEngine(),
      status: 'idle',
      errorMsg: '',
      result: null,
      lastInfo: null,
      logLines: [],
      cancelLogListener: null,
      lastSfenAnalyzed: '',
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
  },

  beforeUnmount() {
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

    async runAnalysis(sfen: string) {
      const trimmed = sfen.trim()
      if (trimmed.length === 0) return
      if (this.status !== 'ready') return
      if (trimmed === this.lastSfenAnalyzed) return

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

      try {
        const r = await this.engine.analyze({
          sfen: trimmed,
          depth: this.depth,
          movetimeMs: this.movetimeMs,
        })

        this.result = r
        this.lastInfo = r.lastInfo ?? null
        this.lastSfenAnalyzed = trimmed
        this.status = 'ready'

        const payload: EngineAnalysisPayload = {
          sfen: trimmed,
          bestmove: r.bestmove ?? null,
          ponder: r.ponder ?? null,
          score: normalizeUsiScore(r.lastInfo?.score),
          pv: r.lastInfo?.pv ? [...r.lastInfo.pv] : [],
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
