import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export type AppDataPaths = {
  rootDir: string
  storageDir: string
  exportsDir: string
  backupsDir: string
  aiSessionsDir: string
  files: {
    commands: string
    credentials: string
    prompts: string
    nodes: string
    httpCollections: string
  }
}

export function resolveAppDataPaths(rootDir: string): AppDataPaths {
  const storageDir = join(rootDir, 'storage')
  const exportsDir = join(rootDir, 'exports')
  const backupsDir = join(rootDir, 'backups')
  const aiSessionsDir = join(rootDir, 'ai-sessions')

  return {
    rootDir,
    storageDir,
    exportsDir,
    backupsDir,
    aiSessionsDir,
    files: {
      commands: join(storageDir, 'commands.json'),
      credentials: join(storageDir, 'credentials.json'),
      prompts: join(storageDir, 'prompts.json'),
      nodes: join(storageDir, 'nodes.json'),
      httpCollections: join(storageDir, 'http-collections.json')
    }
  }
}

export async function ensureAppDataLayout(paths: AppDataPaths): Promise<AppDataPaths> {
  await Promise.all(
    [paths.rootDir, paths.storageDir, paths.exportsDir, paths.backupsDir, paths.aiSessionsDir].map(
      (dir) => mkdir(dir, { recursive: true })
    )
  )

  return paths
}
