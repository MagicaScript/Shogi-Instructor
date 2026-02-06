/* src/logic/yaneuraOuEngine.ts */

import { settingsStore, type SettingsState } from '@/schemes/settings'
import type { AnalyzeParams } from '@/schemes/engineAnalysis'
import {
  YANEURAOU_OPTION_DEFS,
  YANEURAOU_PARAM_DEFAULTS,
  coerceYaneuraOuParam,
  type YaneuraOuOptionDef,
  type YaneuraOuParam,
} from '@/schemes/yaneuraOuParam'
import type { Score } from '@/schemes/usi'

export type UsiInfo = {
  raw: string

  depth?: number
  seldepth?: number
  timeMs?: number
  nodes?: number
  nps?: number
  hashfull?: number
  multipv?: number

  score?: Score
  pv?: string[]
}

export type AnalyzeResult = {
  bestmove: string
  ponder?: string
  lastInfo?: UsiInfo
  log: string[]
  /** True when only one legal move exists (e.g. forced response to check). Requires MultiPV > 1. */
  isOnlyMove: boolean
}

export type {
  AnalyzeDynamicParams,
  AnalyzeParams,
  AnalyzeStaticParams,
} from '@/schemes/engineAnalysis'

export type InitOptions = {
  scriptUrl?: string
  wasmUrl?: string

  /** Optional worker URL (e.g. yaneuraou.material9.worker.js). If omitted, it is derived from scriptUrl. */
  workerUrl?: string

  /** Preferred global factory names. If omitted, auto-detection is used. */
  factoryGlobalNames?: string[]

  /** Script loading mode for the engine JS file. */
  scriptType?: 'classic' | 'module'

  book?: { fileName: string; data: Uint8Array | ArrayBuffer | Blob }
  evalFile?: { fileName: string; data: Uint8Array | ArrayBuffer | Blob }

  setOptions?: Record<string, string | number | boolean>
  handshakeTimeoutMs?: number
  analysisTimeoutMs?: number
}

type LineListener = (line: string) => void

type EmscriptenFs = {
  writeFile: (path: string, data: Uint8Array) => void
}

type EngineInstance = {
  postMessage: (msg: string) => void
  terminate?: () => void
  FS?: EmscriptenFs

  addMessageListener?: (listener: (msg: unknown) => void) => void
  removeMessageListener?: (listener: (msg: unknown) => void) => void

  addEventListener?: (type: 'message', listener: (ev: MessageEvent<unknown>) => void) => void
  removeEventListener?: (type: 'message', listener: (ev: MessageEvent<unknown>) => void) => void
  onmessage?: ((ev: MessageEvent<unknown>) => void) | null

  on?: (type: 'message', listener: (ev: unknown) => void) => void
  off?: (type: 'message', listener: (ev: unknown) => void) => void
  removeListener?: (type: 'message', listener: (ev: unknown) => void) => void
}

type EngineFactoryOptions = {
  wasmBinary?: Uint8Array
  locateFile?: (p: string, prefix?: string) => string
  print?: (text: unknown) => void
  printErr?: (text: unknown) => void
}

type EngineFactory = (opts: EngineFactoryOptions) => Promise<unknown> | unknown

const scriptLoadCache = new Map<string, Promise<void>>()

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isFunction(v: unknown): v is (...args: unknown[]) => unknown {
  return typeof v === 'function'
}

function getGlobalValue(name: string): unknown {
  return (globalThis as unknown as Record<string, unknown>)[name]
}

function splitLines(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\u0000/g, '').trim())
    .filter((l) => l.length > 0)
}

async function toUint8Array(x: Uint8Array | ArrayBuffer | Blob): Promise<Uint8Array> {
  if (x instanceof Uint8Array) return x
  if (x instanceof ArrayBuffer) return new Uint8Array(x)
  return new Uint8Array(await x.arrayBuffer())
}

function parseNumber(token?: string): number | undefined {
  if (!token) return undefined
  const n = Number(token)
  return Number.isFinite(n) ? n : undefined
}

function lineHasToken(line: string, token: string): boolean {
  const parts = line.trim().split(/\s+/)
  return parts.includes(token)
}

function loadClassicScriptOnce(src: string): Promise<void> {
  const key = `classic:${src}`
  const cached = scriptLoadCache.get(key)
  if (cached) return cached

  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script')
    el.src = src
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => reject(new Error(`Failed to load script: ${src}`))
    document.head.appendChild(el)
  })

  scriptLoadCache.set(key, p)
  return p
}

function loadModuleWrapperOnce(moduleUrl: string, attachGlobalName: string): Promise<void> {
  const key = `module-wrapper:${moduleUrl}=>${attachGlobalName}`
  const cached = scriptLoadCache.get(key)
  if (cached) return cached

  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script')
    el.type = 'module'
    el.async = true

    const urlJson = JSON.stringify(moduleUrl)
    const attachJson = JSON.stringify(attachGlobalName)

    el.textContent = `
      import * as mod from ${urlJson};
      const pick = () => {
        if (typeof mod.default === 'function') return mod.default;
        for (const k of Object.keys(mod)) {
          const v = mod[k];
          if (typeof v === 'function') return v;
        }
        return null;
      };
      globalThis[${attachJson}] = pick();
    `

    el.onload = () => resolve()
    el.onerror = () => reject(new Error(`Failed to load module wrapper for: ${moduleUrl}`))
    document.head.appendChild(el)
  })

  scriptLoadCache.set(key, p)
  return p
}

function buildDefaultFactoryCandidates(): string[] {
  return [
    'YaneuraOu_Material9',
    'YaneuraOu',
    'Yaneuraou',
    'yaneuraou',
    'Module',
    'createModule',
    'createYaneuraOu',
    'createYaneuraou',
  ]
}

function findFactoryFromGlobals(names: string[]): { name: string; factory: EngineFactory } | null {
  for (const n of names) {
    const v = getGlobalValue(n)
    if (isFunction(v)) return { name: n, factory: v as EngineFactory }
  }

  const keys = Object.keys(globalThis as unknown as Record<string, unknown>)
  const yaneKeys = keys.filter((k) => k.toLowerCase().includes('yane'))
  for (const k of yaneKeys) {
    const v = getGlobalValue(k)
    if (isFunction(v)) return { name: k, factory: v as EngineFactory }
  }

  return null
}

function describeInterestingGlobals(): string {
  const keys = Object.keys(globalThis as unknown as Record<string, unknown>)
  const interesting = keys
    .filter((k) => {
      const kl = k.toLowerCase()
      return (
        kl.includes('yane') ||
        kl.includes('module') ||
        kl.includes('engine') ||
        kl.includes('emscripten')
      )
    })
    .slice(0, 60)
    .map((k) => `${k}:${typeof getGlobalValue(k)}`)
    .join(', ')
  return interesting.length > 0 ? interesting : '(none)'
}

function deriveWorkerUrl(scriptUrl: string): string {
  const noHash = scriptUrl.split('#')[0] ?? scriptUrl
  const noQuery = noHash.split('?')[0] ?? noHash
  const slash = noQuery.lastIndexOf('/')
  const dir = slash >= 0 ? noQuery.slice(0, slash + 1) : ''
  const file = slash >= 0 ? noQuery.slice(slash + 1) : noQuery
  const workerFile = file.endsWith('.js')
    ? file.replace(/\.js$/u, '.worker.js')
    : `${file}.worker.js`
  return `${dir}${workerFile}`
}

function asEngineInstance(v: unknown): EngineInstance | null {
  if (!isRecord(v)) return null
  const pm = v.postMessage
  if (!isFunction(pm)) return null
  return v as unknown as EngineInstance
}

function hasAddMessageListener(
  inst: EngineInstance,
): inst is EngineInstance & { addMessageListener: (listener: (msg: unknown) => void) => void } {
  return isFunction(inst.addMessageListener)
}

function stringifyUsiValue(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(Math.trunc(v))
  if (typeof v === 'string') return v
  return String(v)
}

function paramEquals(a: YaneuraOuParam, b: YaneuraOuParam): boolean {
  for (const def of YANEURAOU_OPTION_DEFS) {
    const k = def.name
    if (a[k] !== b[k]) return false
  }
  return true
}

function diffParams(
  prev: YaneuraOuParam,
  next: YaneuraOuParam,
): Array<{ def: YaneuraOuOptionDef; value: unknown }> {
  const out: Array<{ def: YaneuraOuOptionDef; value: unknown }> = []
  for (const def of YANEURAOU_OPTION_DEFS) {
    const k = def.name
    if (prev[k] === next[k]) continue
    out.push({ def, value: next[k] })
  }
  return out
}

export class YaneuraOuEngine {
  private instance: EngineInstance | null = null
  private removeMessageListener: (() => void) | null = null

  private listeners = new Set<LineListener>()
  private initPromise: Promise<void> | null = null

  private disposed = false
  private analyzing = false

  private handshakeTimeoutMs = 15_000
  private analysisTimeoutMs = 60_000

  private recentLines: string[] = []
  private readonly recentLinesCap = 400

  private cancelSettingsSub: (() => void) | null = null
  private lastAppliedParams: YaneuraOuParam | null = null
  private applyQueue: Promise<void> = Promise.resolve()

  /** Subscribe to engine output lines. */
  onLine(cb: LineListener): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emitLine(line: string) {
    this.recentLines.push(line)
    if (this.recentLines.length > this.recentLinesCap) {
      this.recentLines.splice(0, this.recentLines.length - this.recentLinesCap)
    }
    for (const cb of this.listeners) cb(line)
  }

  private attachOutput(instance: EngineInstance) {
    const pushText = (text: unknown) => {
      if (typeof text === 'string') {
        for (const l of splitLines(text)) this.emitLine(l)
        return
      }
      if (isRecord(text)) {
        const candidates: unknown[] = [text.line, text.stdout, text.text, text.data]
        for (const c of candidates) {
          if (typeof c === 'string') {
            for (const l of splitLines(c)) this.emitLine(l)
            return
          }
        }
      }
    }

    if (hasAddMessageListener(instance)) {
      const wrapped = (msg: unknown) => {
        pushText(msg)
      }

      instance.addMessageListener(wrapped)
      this.removeMessageListener = () => {
        if (isFunction(instance.removeMessageListener)) instance.removeMessageListener(wrapped)
      }
      return
    }

    if (instance.addEventListener && instance.removeEventListener) {
      const wrapped = (ev: MessageEvent<unknown>) => pushText(this.extractMessageData(ev))
      instance.addEventListener('message', wrapped)
      this.removeMessageListener = () => instance.removeEventListener?.('message', wrapped)
      return
    }

    if ('onmessage' in instance) {
      const wrapped = (ev: MessageEvent<unknown>) => pushText(this.extractMessageData(ev))
      instance.onmessage = wrapped
      this.removeMessageListener = () => {
        if (instance.onmessage === wrapped) instance.onmessage = null
      }
      return
    }

    if (instance.on) {
      const wrapped = (ev: unknown) => pushText(this.extractMessageData(ev))
      instance.on('message', wrapped)
      this.removeMessageListener = () => {
        if (instance.off) instance.off('message', wrapped)
        else if (instance.removeListener) instance.removeListener('message', wrapped)
      }
      return
    }

    this.removeMessageListener = null
  }

  private extractMessageData(evt: unknown): unknown {
    if (typeof MessageEvent !== 'undefined' && evt instanceof MessageEvent) return evt.data
    if (isRecord(evt) && 'data' in evt) return (evt as Record<string, unknown>).data
    return evt
  }

  private waitForLine(predicate: (line: string) => boolean, timeoutMs: number): Promise<string> {
    for (let idx = this.recentLines.length - 1; idx >= 0; idx -= 1) {
      const l = this.recentLines[idx]
      if (l !== undefined && predicate(l)) return Promise.resolve(l)
    }

    return new Promise<string>((resolve, reject) => {
      const t: ReturnType<typeof setTimeout> = setTimeout(() => {
        off()
        reject(new Error(`USI wait timeout after ${timeoutMs}ms`))
      }, timeoutMs)

      const off = this.onLine((line) => {
        if (predicate(line)) {
          clearTimeout(t)
          off()
          resolve(line)
        }
      })
    })
  }

  private ensureInstance(): EngineInstance {
    if (!this.instance) throw new Error('Engine not initialized')
    return this.instance
  }

  private post(command: string) {
    const inst = this.ensureInstance()
    this.emitLine(`> ${command}`)
    inst.postMessage(command)
  }

  private async postAndWait(command: string, token: string, timeoutMs: number): Promise<string> {
    const p = this.waitForLine((l) => lineHasToken(l, token), timeoutMs)
    this.post(command)
    return p
  }

  private getParamsFromState(s: SettingsState): YaneuraOuParam {
    return coerceYaneuraOuParam(s.yaneuraOu, YANEURAOU_PARAM_DEFAULTS)
  }

  private enqueueApply(fn: () => Promise<void>): void {
    this.applyQueue = this.applyQueue.then(fn).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      this.emitLine(`! setoption sync failed: ${msg}`)
    })
  }

  private applyParamsReactive(next: YaneuraOuParam): void {
    if (!this.instance) {
      this.lastAppliedParams = { ...next }
      return
    }

    const prev = this.lastAppliedParams
    if (prev !== null && paramEquals(prev, next)) return

    // When prev is null, treat all options as changed (first apply)
    const changes =
      prev !== null
        ? diffParams(prev, next)
        : YANEURAOU_OPTION_DEFS.map((def) => ({ def, value: next[def.name] }))
    this.lastAppliedParams = { ...next }

    this.enqueueApply(async () => {
      if (this.disposed || !this.instance) return

      if (this.analyzing) {
        try {
          this.post('stop')
        } catch {
          // ignore
        }
      }

      for (const ch of changes) {
        const name = ch.def.name
        const v = stringifyUsiValue(ch.value)
        this.post(`setoption name ${String(name)} value ${v}`)
      }

      await this.postAndWait('isready', 'readyok', this.handshakeTimeoutMs)
      this.post('usinewgame')
      await this.postAndWait('isready', 'readyok', this.handshakeTimeoutMs)
    })
  }

  private bindSettings(): void {
    if (this.cancelSettingsSub) return
    this.cancelSettingsSub = settingsStore.subscribe((s) => {
      const params = this.getParamsFromState(s)
      this.applyParamsReactive(params)
    })
  }

  /** Initialize the engine runtime and finish USI handshake. */
  async init(options: InitOptions = {}): Promise<void> {
    if (this.disposed) throw new Error('Engine already disposed')
    if (this.initPromise) return this.initPromise

    if (typeof SharedArrayBuffer === 'undefined') {
      throw new Error(
        "SharedArrayBuffer is missing. Serve with COOP/COEP: 'Cross-Origin-Opener-Policy: same-origin' and 'Cross-Origin-Embedder-Policy: require-corp'.",
      )
    }

    /* IMPORTANT: Must be relative path. WASM + Emscripten require relative path.
    This module may be loaded from non-root paths, file://, or iframe.
    DO NOT convert to absolute (/lib/...) path.*/
    const scriptUrl = options.scriptUrl ?? './lib/yaneuraou.material9.js'
    const wasmUrl = options.wasmUrl ?? './lib/yaneuraou.material9.wasm'
    const workerUrl = options.workerUrl ?? deriveWorkerUrl(scriptUrl)

    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? 15_000
    this.analysisTimeoutMs = options.analysisTimeoutMs ?? 60_000

    const preferred = options.factoryGlobalNames ?? []
    const candidates = preferred.length > 0 ? preferred : buildDefaultFactoryCandidates()

    this.initPromise = (async () => {
      let found = findFactoryFromGlobals(candidates)

      if (!found) {
        const mode = options.scriptType ?? 'classic'

        if (mode === 'classic') {
          await loadClassicScriptOnce(scriptUrl)
          found = findFactoryFromGlobals(candidates)

          if (!found) {
            const attached = '__yaneuraou_factory__'
            await loadModuleWrapperOnce(scriptUrl, attached)
            found = findFactoryFromGlobals([attached, ...candidates])
          }
        } else {
          const attached = '__yaneuraou_factory__'
          await loadModuleWrapperOnce(scriptUrl, attached)
          found = findFactoryFromGlobals([attached, ...candidates])
        }
      }

      if (!found) {
        const dbg = describeInterestingGlobals()
        throw new Error(
          `Engine factory not found after loading ${scriptUrl}. ` +
            `Try init({ factoryGlobalNames: ["YaneuraOu_Material9"] }) or check what the script exposes on globalThis. ` +
            `Detected globals: ${dbg}`,
        )
      }

      const wasmResp = await fetch(wasmUrl)
      if (!wasmResp.ok) throw new Error(`Failed to fetch wasm: ${wasmUrl} (${wasmResp.status})`)
      const wasmBinary = new Uint8Array(await wasmResp.arrayBuffer())

      const created = await found.factory({
        wasmBinary,
        locateFile: (p: string, prefix?: string) => {
          if (p.endsWith('.worker.js')) return workerUrl
          if (p.endsWith('.wasm')) return wasmUrl
          return (prefix ?? '') + p
        },
        print: (text) => {
          if (typeof text === 'string') for (const l of splitLines(text)) this.emitLine(l)
        },
        printErr: (text) => {
          if (typeof text === 'string') for (const l of splitLines(text)) this.emitLine(l)
        },
      })

      const inst = asEngineInstance(created)
      if (!inst) {
        throw new Error(`Factory "${found.name}" did not return an EngineInstance-like object.`)
      }

      this.instance = inst
      this.attachOutput(inst)

      const deferredSetOptions: string[] = []

      const FS = inst.FS
      if (FS && typeof FS.writeFile === 'function') {
        if (options.book) {
          const buf = await toUint8Array(options.book.data)
          FS.writeFile(`/${options.book.fileName}`, buf)
          deferredSetOptions.push('setoption name BookDir value .')
          deferredSetOptions.push(`setoption name BookFile value ${options.book.fileName}`)
        }

        if (options.evalFile) {
          const buf = await toUint8Array(options.evalFile.data)
          FS.writeFile(`/${options.evalFile.fileName}`, buf)
          deferredSetOptions.push('setoption name EvalDir value .')
        }
      }

      await this.postAndWait('usi', 'usiok', this.handshakeTimeoutMs)

      if (options.setOptions) {
        for (const [k, v] of Object.entries(options.setOptions)) {
          deferredSetOptions.push(`setoption name ${k} value ${stringifyUsiValue(v)}`)
        }
      }

      for (const cmd of deferredSetOptions) this.post(cmd)

      this.bindSettings()

      await this.postAndWait('isready', 'readyok', this.handshakeTimeoutMs)

      // Callback: apply default parameters after engine ready
      const onReadyCallback = (): void => {
        this.applyParamsReactive(YANEURAOU_PARAM_DEFAULTS)
      }
      onReadyCallback()
      await this.applyQueue
    })().catch((e) => {
      this.initPromise = null
      throw e
    })

    return this.initPromise
  }

  /** Run analysis and resolve when "bestmove" is received. */
  async analyze(params: AnalyzeParams): Promise<AnalyzeResult> {
    if (this.disposed) throw new Error('Engine disposed')
    await this.init()

    const sfen = params.sfen.trim()
    if (!sfen) throw new Error('Empty SFEN')

    if (this.analyzing) {
      try {
        this.post('stop')
      } catch {
        // ignore
      }
    }

    this.analyzing = true

    const log: string[] = []
    let lastInfo: UsiInfo | undefined
    let done = false
    let hasMultipvField = false

    const bestmovePromise = new Promise<string>((resolve, reject) => {
      const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
        if (!done) reject(new Error('Analysis timeout'))
      }, this.analysisTimeoutMs)

      const off = this.onLine((line) => {
        log.push(line)
        if (line.startsWith('info ')) {
          const parsed = this.parseUsiInfoLine(line)
          // Track if any multipv field was present (indicates multiple legal moves)
          if (parsed.multipv !== undefined) {
            hasMultipvField = true
          }
          // Only keep info from multipv=1 (or when multipv is not specified)
          if (parsed.multipv === undefined || parsed.multipv === 1) {
            lastInfo = parsed
          }
        }

        if (line.startsWith('bestmove ')) {
          done = true
          clearTimeout(timeoutId)
          off()
          resolve(line)
        }
      })
    })

    try {
      this.post(`position sfen ${sfen}`)

      if (
        typeof params.movetimeMs === 'number' &&
        Number.isFinite(params.movetimeMs) &&
        params.movetimeMs > 0
      ) {
        this.post(`go movetime ${Math.max(1, Math.floor(params.movetimeMs))}`)
      } else {
        const depth = params.depth ?? 18
        this.post(`go depth ${Math.max(1, Math.floor(depth))}`)
      }

      const bestmoveLine = await bestmovePromise
      const parts = bestmoveLine.trim().split(/\s+/)
      const bestmove = parts[1] ?? ''

      const ponderIdx = parts.indexOf('ponder')
      const ponder = ponderIdx >= 0 ? parts[ponderIdx + 1] : undefined

      // Detect only-move: when MultiPV > 1 but no multipv field in output
      const multiPVSetting = this.lastAppliedParams?.MultiPV ?? YANEURAOU_PARAM_DEFAULTS.MultiPV
      const isOnlyMove = multiPVSetting > 1 && !hasMultipvField

      return { bestmove, ponder, lastInfo, log, isOnlyMove }
    } finally {
      this.analyzing = false
    }
  }

  /** Dispose the engine instance. */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true

    try {
      this.instance?.postMessage('quit')
    } catch {
      // ignore
    }

    try {
      this.cancelSettingsSub?.()
    } catch {
      // ignore
    } finally {
      this.cancelSettingsSub = null
    }

    try {
      this.removeMessageListener?.()
    } catch {
      // ignore
    } finally {
      this.removeMessageListener = null
    }

    try {
      this.instance?.terminate?.()
    } catch {
      // ignore
    } finally {
      this.instance = null
      this.initPromise = null
      this.listeners.clear()
      this.recentLines = []
    }
  }

  private parseUsiInfoLine(line: string): UsiInfo {
    const info: UsiInfo = { raw: line }
    const parts = line.trim().split(/\s+/)

    let i = 1
    while (i < parts.length) {
      const key = parts[i++]
      if (!key) break

      switch (key) {
        case 'depth':
          info.depth = parseNumber(parts[i++])
          break
        case 'seldepth':
          info.seldepth = parseNumber(parts[i++])
          break
        case 'time':
          info.timeMs = parseNumber(parts[i++])
          break
        case 'nodes':
          info.nodes = parseNumber(parts[i++])
          break
        case 'nps':
          info.nps = parseNumber(parts[i++])
          break
        case 'hashfull':
          info.hashfull = parseNumber(parts[i++])
          break
        case 'multipv':
          info.multipv = parseNumber(parts[i++])
          break
        case 'score': {
          const t = parts[i++]
          const v = parts[i++]

          if (t === 'cp') {
            const n = Number(v)
            info.score = Number.isFinite(n) ? { type: 'cp', value: n } : { type: 'none' }
          } else if (t === 'mate') {
            if (v === '+' || v === '-') {
              info.score = { type: 'mate', value: 'unknown' }
            } else {
              const n = Number(v)
              info.score = Number.isFinite(n)
                ? { type: 'mate', value: n }
                : { type: 'mate', value: 'unknown' }
            }
          } else {
            info.score = { type: 'none' }
          }
          break
        }
        case 'pv':
          info.pv = parts.slice(i)
          i = parts.length
          break
        default:
          if (i < parts.length) i += 1
          break
      }
    }

    return info
  }
}
