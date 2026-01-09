export type Score =
  | { type: 'none' }
  | { type: 'cp'; value: number }
  | { type: 'mate'; value: number | 'unknown' }

export type UsiInfo = {
  raw: string

  depth?: number
  seldepth?: number
  timeMs?: number
  nodes?: number
  nps?: number
  hashfull?: number

  score?: Score
  pv?: string[]
}

export type AnalyzeResult = {
  bestmove: string
  ponder?: string
  lastInfo?: UsiInfo
  log: string[]
}

export type AnalyzeParams = {
  sfen: string
  depth?: number
  movetimeMs?: number
}

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

  /** Some builds expose this (your working code uses it). */
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

function parseUsiInfoLine(line: string): UsiInfo {
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
        // Skip one token as a conservative fallback for unknown keys.
        if (i < parts.length) i += 1
        break
    }
  }

  return info
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
    // Common for YaneuraOu WASM bundles
    'YaneuraOu_Material9',
    'YaneuraOu',
    'Yaneuraou',
    'yaneuraou',
    // Emscripten modularize defaults
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

    // Priority: engine-specific listener API (your working example uses this).
    if (hasAddMessageListener(instance)) {
      const wrapped = (msg: unknown) => {
        // Some builds send a single line, some send multi-line chunks.
        pushText(msg)
      }

      instance.addMessageListener(wrapped)
      this.removeMessageListener = () => {
        if (isFunction(instance.removeMessageListener)) instance.removeMessageListener(wrapped)
      }
      return
    }

    // WebWorker-like
    if (instance.addEventListener && instance.removeEventListener) {
      const wrapped = (ev: MessageEvent<unknown>) => pushText(this.extractMessageData(ev))
      instance.addEventListener('message', wrapped)
      this.removeMessageListener = () => instance.removeEventListener?.('message', wrapped)
      return
    }

    // onmessage-like
    if ('onmessage' in instance) {
      const wrapped = (ev: MessageEvent<unknown>) => pushText(this.extractMessageData(ev))
      instance.onmessage = wrapped
      this.removeMessageListener = () => {
        if (instance.onmessage === wrapped) instance.onmessage = null
      }
      return
    }

    // Node-style emitter-like
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

  /** Initialize the engine runtime and finish USI handshake. */
  async init(options: InitOptions = {}): Promise<void> {
    if (this.disposed) throw new Error('Engine already disposed')
    if (this.initPromise) return this.initPromise

    if (typeof SharedArrayBuffer === 'undefined') {
      throw new Error(
        "SharedArrayBuffer is missing. Serve with COOP/COEP: 'Cross-Origin-Opener-Policy: same-origin' and 'Cross-Origin-Embedder-Policy: require-corp'.",
      )
    }

    const scriptUrl = options.scriptUrl ?? '/lib/yaneuraou.material9.js'
    const wasmUrl = options.wasmUrl ?? '/lib/yaneuraou.material9.wasm'
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
          // Some builds call locateFile for other assets; keep default behavior.
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

      const FS = inst.FS
      if (FS && typeof FS.writeFile === 'function') {
        if (options.book) {
          const buf = await toUint8Array(options.book.data)
          FS.writeFile(`/${options.book.fileName}`, buf)
          this.post('setoption name BookDir value .')
          this.post(`setoption name BookFile value ${options.book.fileName}`)
        }

        if (options.evalFile) {
          const buf = await toUint8Array(options.evalFile.data)
          FS.writeFile(`/${options.evalFile.fileName}`, buf)
          this.post('setoption name EvalDir value .')
        }
      }

      if (options.setOptions) {
        for (const [k, v] of Object.entries(options.setOptions)) {
          this.post(`setoption name ${k} value ${String(v)}`)
        }
      }

      await this.postAndWait('usi', 'usiok', this.handshakeTimeoutMs)
      await this.postAndWait('isready', 'readyok', this.handshakeTimeoutMs)

      this.post('usinewgame')
      await this.postAndWait('isready', 'readyok', this.handshakeTimeoutMs)
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

    const bestmovePromise = new Promise<string>((resolve, reject) => {
      const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
        if (!done) reject(new Error('Analysis timeout'))
      }, this.analysisTimeoutMs)

      const off = this.onLine((line) => {
        log.push(line)
        if (line.startsWith('info ')) lastInfo = parseUsiInfoLine(line)

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

      if (typeof params.movetimeMs === 'number' && Number.isFinite(params.movetimeMs)) {
        this.post(`go movetime ${Math.max(0, Math.floor(params.movetimeMs))}`)
      } else {
        const depth = params.depth ?? 12
        this.post(`go depth ${Math.max(1, Math.floor(depth))}`)
      }

      const bestmoveLine = await bestmovePromise
      const parts = bestmoveLine.trim().split(/\s+/)
      const bestmove = parts[1] ?? ''

      const ponderIdx = parts.indexOf('ponder')
      const ponder = ponderIdx >= 0 ? parts[ponderIdx + 1] : undefined

      return { bestmove, ponder, lastInfo, log }
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
}
