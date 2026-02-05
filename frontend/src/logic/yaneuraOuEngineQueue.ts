import { YaneuraOuEngine, type AnalyzeParams, type AnalyzeResult } from '@/logic/YaneuraOuEngine'

type LineListener = (line: string) => void

type AnalysisQueueItem = {
  params: AnalyzeParams
  resolve: (result: AnalyzeResult) => void
  reject: (error: unknown) => void
}

export class YaneuraOuEngineQueue {
  private engine: YaneuraOuEngine
  private queue: AnalysisQueueItem[] = []
  private processing = false
  private disposed = false
  private listeners = new Set<LineListener>()
  private cancelEngineLog: (() => void) | null = null
  private readonly logLinesCap = 400

  readonly logLines: string[] = []

  constructor(engine?: YaneuraOuEngine) {
    this.engine = engine ?? new YaneuraOuEngine()
  }

  onLine(cb: LineListener): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emitLine(line: string): void {
    this.logLines.push(line)
    if (this.logLines.length > this.logLinesCap) {
      this.logLines.splice(0, this.logLines.length - this.logLinesCap)
    }
    for (const cb of this.listeners) cb(line)
  }

  async init(): Promise<void> {
    if (this.disposed) throw new Error('Engine disposed')

    if (!this.cancelEngineLog) {
      this.cancelEngineLog = this.engine.onLine((line: string) => {
        this.emitLine(line)
      })
    }

    await this.engine.init()
  }

  enqueueAnalysis(params: AnalyzeParams): Promise<AnalyzeResult> {
    if (this.disposed) return Promise.reject(new Error('Engine disposed'))

    return new Promise<AnalyzeResult>((resolve, reject) => {
      this.queue.push({ params, resolve, reject })
      this.startProcessing()
    })
  }

  private startProcessing(): void {
    if (this.processing) return
    this.processing = true
    void this.processQueue()
  }

  private async processQueue(): Promise<void> {
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift()
        if (!item) continue

        if (this.disposed) {
          item.reject(new Error('Engine disposed'))
          continue
        }

        try {
          const result = await this.engine.analyze(item.params)
          item.resolve(result)
        } catch (e: unknown) {
          item.reject(e)
        }
      }
    } finally {
      this.processing = false
      if (this.queue.length > 0) this.startProcessing()
    }
  }

  private rejectPending(error: Error): void {
    const pending = this.queue.splice(0, this.queue.length)
    for (const item of pending) item.reject(error)
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.rejectPending(new Error('Engine disposed'))

    try {
      this.cancelEngineLog?.()
    } finally {
      this.cancelEngineLog = null
    }

    await this.engine.dispose()
    this.listeners.clear()
    this.logLines.length = 0
  }
}
