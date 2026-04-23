import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type {
  LocalRuntimeFact,
  LocalRuntimeFileState,
  LocalRuntimeStatus,
  RuntimeInfo
} from '../../shared/ipc-contract'

type CodexConfigSnapshot = {
  configPath: string
  authPath: string
  available: boolean
  model?: string
  baseUrl?: string
  serviceTier?: string
  approvalPolicy?: string
  sandboxMode?: string
}

type ClaudeConfigSnapshot = {
  configPath: string
  available: boolean
  installMethod?: string
  autoUpdates?: boolean
  projectsCount?: number
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

function parseTomlScalar(raw: string, key: string): string | undefined {
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, 'm')
  const match = raw.match(pattern)
  if (!match) return undefined
  return match[1]?.trim().replace(/^"(.*)"$/, '$1') || undefined
}

function createFileState(label: string, path: string, exists: boolean): LocalRuntimeFileState {
  return { label, path, exists }
}

function createFact(label: string, value: string | undefined): LocalRuntimeFact | null {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) return null
  return { label, value: normalized }
}

export class LocalAiRuntimeService {
  async getCodexSnapshot(): Promise<CodexConfigSnapshot> {
    const configPath = join(homedir(), '.codex', 'config.toml')
    const authPath = join(homedir(), '.codex', 'auth.json')
    const [hasConfig, hasAuth] = await Promise.all([fileExists(configPath), fileExists(authPath)])
    const rawConfig = hasConfig ? await readFile(configPath, 'utf8') : ''

    return {
      configPath,
      authPath,
      available: hasConfig || hasAuth,
      model: parseTomlScalar(rawConfig, 'model'),
      baseUrl: parseTomlScalar(rawConfig, 'base_url'),
      serviceTier: parseTomlScalar(rawConfig, 'service_tier'),
      approvalPolicy: parseTomlScalar(rawConfig, 'approval_policy'),
      sandboxMode: parseTomlScalar(rawConfig, 'sandbox_mode')
    }
  }

  async getClaudeSnapshot(): Promise<ClaudeConfigSnapshot> {
    const configPath = join(homedir(), '.claude.json')
    const available = await fileExists(configPath)
    if (!available) {
      return { configPath, available: false }
    }

    try {
      const raw = await readFile(configPath, 'utf8')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const projects = parsed.projects
      const projectsCount =
        projects && typeof projects === 'object' ? Object.keys(projects as object).length : 0
      return {
        configPath,
        available: true,
        installMethod: typeof parsed.installMethod === 'string' ? parsed.installMethod : undefined,
        autoUpdates: typeof parsed.autoUpdates === 'boolean' ? parsed.autoUpdates : undefined,
        projectsCount
      }
    } catch {
      return {
        configPath,
        available: true
      }
    }
  }

  async getCodexStatus(): Promise<LocalRuntimeStatus> {
    const snapshot = await this.getCodexSnapshot()
    const facts = [
      createFact('model', snapshot.model),
      createFact('base_url', snapshot.baseUrl),
      createFact('service_tier', snapshot.serviceTier),
      createFact('approval_policy', snapshot.approvalPolicy),
      createFact('sandbox_mode', snapshot.sandboxMode)
    ].filter((fact): fact is LocalRuntimeFact => Boolean(fact))

    return {
      available: snapshot.available,
      checkedAt: new Date().toISOString(),
      details: snapshot.available ? '已检测到本机 Codex 配置或登录态' : '未检测到 ~/.codex 配置',
      configPath: snapshot.configPath,
      authPath: snapshot.authPath,
      files: [
        createFileState('config.toml', snapshot.configPath, await fileExists(snapshot.configPath)),
        createFileState('auth.json', snapshot.authPath, await fileExists(snapshot.authPath))
      ],
      facts
    }
  }

  async getClaudeStatus(): Promise<LocalRuntimeStatus> {
    const snapshot = await this.getClaudeSnapshot()
    const facts = [
      createFact('install_method', snapshot.installMethod),
      createFact(
        'auto_updates',
        typeof snapshot.autoUpdates === 'boolean' ? String(snapshot.autoUpdates) : undefined
      ),
      createFact(
        'projects_count',
        typeof snapshot.projectsCount === 'number' ? String(snapshot.projectsCount) : undefined
      )
    ].filter((fact): fact is LocalRuntimeFact => Boolean(fact))

    return {
      available: snapshot.available,
      checkedAt: new Date().toISOString(),
      details: snapshot.available ? '已检测到本机 Claude Code 配置' : '未检测到 ~/.claude.json',
      configPath: snapshot.configPath,
      files: [createFileState('~/.claude.json', snapshot.configPath, snapshot.available)],
      facts
    }
  }

  async getRuntimeInfo(input: {
    appName: string
    appVersion: string
    platform: NodeJS.Platform
    dataDir: string
  }): Promise<RuntimeInfo> {
    const [codex, claude] = await Promise.all([this.getCodexStatus(), this.getClaudeStatus()])

    return {
      appName: input.appName,
      appVersion: input.appVersion,
      platform: input.platform,
      dataDir: input.dataDir,
      codex,
      claude
    }
  }
}
