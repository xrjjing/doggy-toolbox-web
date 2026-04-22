import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

export class JsonFileRepository<T> {
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly filePath: string,
    private readonly createDefault: () => T
  ) {}

  get path(): string {
    return this.filePath
  }

  async read(): Promise<T> {
    await this.ensureParentDir()

    try {
      const raw = await readFile(this.filePath, 'utf8')
      return JSON.parse(raw) as T
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        const initialValue = this.createDefault()
        await this.write(initialValue)
        return initialValue
      }
      throw error
    }
  }

  async write(data: T): Promise<void> {
    await this.enqueue(async () => {
      await this.ensureParentDir()
      await this.writeFileAtomic(data)
    })
  }

  async update(updater: (current: T) => T | Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      await this.ensureParentDir()
      const current = await this.readWithoutBootstrap()
      const next = await updater(current)
      await this.writeFileAtomic(next)
      return next
    })
  }

  private async readWithoutBootstrap(): Promise<T> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      return JSON.parse(raw) as T
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        return this.createDefault()
      }
      throw error
    }
  }

  private async writeFileAtomic(data: T): Promise<void> {
    const tempFile = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    const serialized = JSON.stringify(data, null, 2)
    await writeFile(tempFile, serialized, 'utf8')
    await rename(tempFile, this.filePath)
  }

  private async ensureParentDir(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
  }

  private async enqueue<R>(task: () => Promise<R>): Promise<R> {
    const run = this.writeQueue.then(task, task)
    this.writeQueue = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }
}
