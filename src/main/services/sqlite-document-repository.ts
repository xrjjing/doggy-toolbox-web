import { execFile } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
let schemaReady: Promise<void> | null = null
let writeQueue: Promise<void> = Promise.resolve()

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''")
}

export class SqliteDocumentRepository<T> {
  constructor(
    private readonly dbPath: string,
    private readonly moduleKey: string,
    private readonly legacyJsonPath: string,
    private readonly createDefault: () => T
  ) {}

  get path(): string {
    return this.dbPath
  }

  async read(): Promise<T> {
    await this.ensureDatabase()
    const existing = await this.readDocument()
    if (existing) return JSON.parse(existing) as T

    const initialValue = await this.readLegacyJsonOrDefault()
    await this.write(initialValue)
    return initialValue
  }

  async write(data: T): Promise<void> {
    await this.enqueue(async () => {
      await this.ensureDatabase()
      await this.writeDocument(data)
    })
  }

  async update(updater: (current: T) => T | Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      await this.ensureDatabase()
      const raw = await this.readDocument()
      const current = raw ? (JSON.parse(raw) as T) : await this.readLegacyJsonOrDefault()
      const next = await updater(current)
      await this.writeDocument(next)
      return next
    })
  }

  private async readLegacyJsonOrDefault(): Promise<T> {
    try {
      const raw = await readFile(this.legacyJsonPath, 'utf8')
      return JSON.parse(raw) as T
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        return this.createDefault()
      }
      throw error
    }
  }

  private async ensureDatabase(): Promise<void> {
    if (!schemaReady) {
      schemaReady = (async () => {
        await mkdir(dirname(this.dbPath), { recursive: true })
        await this.execSql(`
          CREATE TABLE IF NOT EXISTS app_documents (
            module_key TEXT PRIMARY KEY NOT NULL,
            payload_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `)
      })()
    }

    await schemaReady
  }

  private async readDocument(): Promise<string | null> {
    const stdout = await this.execSql(
      `SELECT payload_json FROM app_documents WHERE module_key = '${escapeSqlString(this.moduleKey)}';`
    )
    const rows = JSON.parse(stdout || '[]') as Array<{ payload_json?: string }>
    return typeof rows[0]?.payload_json === 'string' ? rows[0].payload_json : null
  }

  private async writeDocument(data: T): Promise<void> {
    const payload = JSON.stringify(data)
    const sql = `
      INSERT INTO app_documents (module_key, payload_json, updated_at)
      VALUES ('${escapeSqlString(this.moduleKey)}', '${escapeSqlString(payload)}', datetime('now'))
      ON CONFLICT(module_key) DO UPDATE SET
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at;
    `
    await this.execSql(sql)
  }

  private async execSql(sql: string): Promise<string> {
    const { stdout } = await execFileAsync('sqlite3', ['-json', '-cmd', '.timeout 5000', this.dbPath, sql], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 20
    })
    return stdout.trim()
  }

  private async enqueue<R>(task: () => Promise<R>): Promise<R> {
    const run = writeQueue.then(task, task)
    writeQueue = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }
}
