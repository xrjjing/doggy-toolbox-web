import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export type AppDataPaths = {
  rootDir: string
  storageDir: string
  exportsDir: string
  backupsDir: string
  aiSessionsDir: string
  files: {
    database: string
    commands: string
    credentials: string
    prompts: string
    httpCollections: string
    aiChatSessions: string
    aiSettings: string
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
      database: join(rootDir, 'doggy_toolbox_web.db'),
      commands: join(storageDir, 'commands.json'),
      credentials: join(storageDir, 'credentials.json'),
      prompts: join(storageDir, 'prompts.json'),
      httpCollections: join(storageDir, 'http-collections.json'),
      aiChatSessions: join(storageDir, 'ai-chat-sessions.json'),
      aiSettings: join(storageDir, 'ai-settings.json')
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
