<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { YaneuraOuEngine, type AnalyzeResult, type UsiInfo } from '@/logic/YaneuraOuEngine'

type Props = {
  sfen: string
  depth?: number
  movetimeMs?: number
}

const props = withDefaults(defineProps<Props>(), {
  depth: 12,
  movetimeMs: undefined,
})

const engine = new YaneuraOuEngine()

const status = ref<'idle' | 'loading' | 'ready' | 'analyzing' | 'error'>('idle')
const errorMsg = ref<string>('')

const result = ref<AnalyzeResult | null>(null)
const lastInfo = ref<UsiInfo | null>(null)
const logLines = ref<string[]>([])

const canAnalyze = computed(() => props.sfen.trim().length > 0 && status.value === 'ready')
const prettyScore = computed(() => {
  const info = lastInfo.value
  if (!info?.score || info.score.type === 'none') return ''
  if (info.score.type === 'cp') return `cp ${info.score.value}`
  if (info.score.value === 'unknown') return 'mate ?'
  return `mate ${info.score.value}`
})

let cancelLogListener: (() => void) | null = null
let lastSfenAnalyzed = ''

async function initEngine() {
  status.value = 'loading'
  errorMsg.value = ''
  logLines.value = []
  result.value = null
  lastInfo.value = null

  try {
    cancelLogListener?.()
    cancelLogListener = engine.onLine((line) => {
      logLines.value.push(line)
      if (logLines.value.length > 300) logLines.value.splice(0, logLines.value.length - 300)
      const info = line.startsWith('info ') ? (null as unknown) : null
      void info
    })

    await engine.init()
    status.value = 'ready'
  } catch (e: unknown) {
    status.value = 'error'
    errorMsg.value = e instanceof Error ? e.message : String(e)
  }
}

async function runAnalysis(sfen: string) {
  const trimmed = sfen.trim()
  if (trimmed.length === 0) return
  if (status.value !== 'ready') return
  if (trimmed === lastSfenAnalyzed) return

  status.value = 'analyzing'
  errorMsg.value = ''
  result.value = null
  lastInfo.value = null
  logLines.value = []

  const off = engine.onLine((line) => {
    if (line.startsWith('info ')) {
      // Parse last-info cheaply: let engine TS parse in result as truth; here we only keep the last raw info line for UI continuity.
      lastInfo.value = { raw: line }
    }
  })

  try {
    const r = await engine.analyze({
      sfen: trimmed,
      depth: props.depth,
      movetimeMs: props.movetimeMs,
    })
    result.value = r
    lastInfo.value = r.lastInfo ?? null
    lastSfenAnalyzed = trimmed
    status.value = 'ready'
  } catch (e: unknown) {
    status.value = 'error'
    errorMsg.value = e instanceof Error ? e.message : String(e)
  } finally {
    off()
  }
}

watch(
  () => props.sfen,
  (next) => {
    void runAnalysis(next)
  },
)

onMounted(() => {
  void initEngine()
})

onBeforeUnmount(() => {
  cancelLogListener?.()
  cancelLogListener = null
  void engine.dispose()
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
