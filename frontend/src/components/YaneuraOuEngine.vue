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
    /** Keep log size bounded for UI and memory safety. */
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
  <section class="engine-card">
    <header class="engine-header">
      <h2>YaneuraOu Engine</h2>

      <div class="engine-status">
        <span class="badge" :class="status">{{ status }}</span>
        <span v-if="errorMsg" class="error">{{ errorMsg }}</span>
      </div>
    </header>

    <div class="engine-body">
      <div class="row">
        <div class="label">SFEN</div>
        <div class="value mono">{{ sfen || '(empty)' }}</div>
      </div>

      <div class="row">
        <div class="label">Bestmove</div>
        <div class="value mono">{{ result?.bestmove ?? '-' }}</div>
      </div>

      <div class="row">
        <div class="label">Ponder</div>
        <div class="value mono">{{ result?.ponder ?? '-' }}</div>
      </div>

      <div class="row">
        <div class="label">Score</div>
        <div class="value mono">{{ prettyScore || '-' }}</div>
      </div>

      <div class="row">
        <div class="label">PV</div>
        <div class="value mono">
          <span v-if="result?.lastInfo?.pv?.length">{{ result.lastInfo.pv.join(' ') }}</span>
          <span v-else>-</span>
        </div>
      </div>

      <div class="row">
        <div class="label">Logs</div>
        <div class="value">
          <div class="log mono">
            <div v-for="(l, i) in logLines" :key="i">{{ l }}</div>
          </div>
        </div>
      </div>

      <div class="hint" v-if="!canAnalyze">
        Engine will analyze automatically when a non-empty SFEN is provided and engine is ready.
      </div>
    </div>
  </section>
</template>

<style scoped>
.engine-card {
  width: 980px;
  max-width: calc(100vw - 48px);
  border: 1px solid #ddd;
  border-radius: 14px;
  padding: 14px 16px;
  background: #fff;
}

.engine-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.engine-status {
  display: flex;
  align-items: center;
  gap: 10px;
}

.badge {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid #ccc;
  color: #333;
}

.badge.loading,
.badge.analyzing {
  border-color: #999;
}

.badge.error {
  border-color: #b00020;
  color: #b00020;
}

.error {
  font-size: 12px;
  color: #b00020;
  max-width: 520px;
}

.engine-body {
  margin-top: 12px;
  display: grid;
  gap: 10px;
}

.row {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 12px;
  align-items: start;
}

.label {
  font-size: 12px;
  color: #666;
  padding-top: 3px;
}

.value {
  font-size: 13px;
  color: #111;
  word-break: break-word;
}

.mono {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
}

.log {
  border: 1px solid #eee;
  border-radius: 10px;
  padding: 8px 10px;
  max-height: 220px;
  overflow: auto;
  background: #fafafa;
  font-size: 12px;
  line-height: 1.35;
}

.hint {
  font-size: 12px;
  color: #666;
}
</style>
