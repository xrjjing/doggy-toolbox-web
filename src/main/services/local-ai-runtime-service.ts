import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type {
  AiSdkRuntimeState,
  LocalRuntimeFact,
  LocalRuntimeFileState,
  LocalRuntimeStatus,
  RuntimeInfo
} from '../../shared/ipc-contract'
import type { AiSdkRuntimeManager } from './ai-sdk-runtime-manager'

/**
 * 对 `~/.codex` 配置的最小可见快照。
 * 这里只提取用于展示和 bridge 初始化的字段，不读取也不暴露任何敏感 token 内容。
 */
type CodexConfigSnapshot = {
  configPath: string
  authPath: string
  configDetected: boolean
  model?: string
  baseUrl?: string
  serviceTier?: string
  approvalPolicy?: string
  sandboxMode?: string
}

/**
 * Claude Code 本地配置快照。
 * 目的同样是做“可见事实”展示，而不是把完整配置对象传到 renderer。
 */
type ClaudeConfigSnapshot = {
  configPath: string
  configDetected: boolean
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

/**
 * 这里刻意只支持简单的顶层标量读取。
 * 当前需求只是检测本机运行时是否可用，不需要引入完整 TOML 解析器扩大依赖面。
 */
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

/**
 * 本地 AI 运行时探测服务。
 *
 * 主要职责：
 * 1. 在主进程读取本机 Codex / Claude 配置事实。
 * 2. 给 UI 提供“当前机器能否运行 AI”的可审计信息。
 * 3. 给 provider bridge 提供初始化 SDK 所需的最小运行时快照。
 */
export class LocalAiRuntimeService {
  constructor(private readonly sdkRuntimeManager?: AiSdkRuntimeManager) {}

  async getCodexSnapshot(): Promise<CodexConfigSnapshot> {
    const configPath = join(homedir(), '.codex', 'config.toml')
    const authPath = join(homedir(), '.codex', 'auth.json')
    const [hasConfig, hasAuth] = await Promise.all([fileExists(configPath), fileExists(authPath)])
    const rawConfig = hasConfig ? await readFile(configPath, 'utf8') : ''

    return {
      configPath,
      authPath,
      configDetected: hasConfig || hasAuth,
      model: parseTomlScalar(rawConfig, 'model'),
      baseUrl: parseTomlScalar(rawConfig, 'base_url'),
      serviceTier: parseTomlScalar(rawConfig, 'service_tier'),
      approvalPolicy: parseTomlScalar(rawConfig, 'approval_policy'),
      sandboxMode: parseTomlScalar(rawConfig, 'sandbox_mode')
    }
  }

  async getClaudeSnapshot(): Promise<ClaudeConfigSnapshot> {
    const configPath = join(homedir(), '.claude.json')
    const configDetected = await fileExists(configPath)
    if (!configDetected) {
      return { configPath, configDetected: false }
    }

    try {
      const raw = await readFile(configPath, 'utf8')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const projects = parsed.projects
      const projectsCount =
        projects && typeof projects === 'object' ? Object.keys(projects as object).length : 0
      return {
        configPath,
        configDetected: true,
        installMethod: typeof parsed.installMethod === 'string' ? parsed.installMethod : undefined,
        autoUpdates: typeof parsed.autoUpdates === 'boolean' ? parsed.autoUpdates : undefined,
        projectsCount
      }
    } catch {
      return {
        configPath,
        configDetected: true
      }
    }
  }

  async getCodexStatus(): Promise<LocalRuntimeStatus> {
    const [snapshot, runtimeStatus] = await Promise.all([
      this.getCodexSnapshot(),
      this.sdkRuntimeManager?.getStatus('codex')
    ])
    const facts = [
      createFact('model', snapshot.model),
      createFact('base_url', snapshot.baseUrl),
      createFact('service_tier', snapshot.serviceTier),
      createFact('approval_policy', snapshot.approvalPolicy),
      createFact('sandbox_mode', snapshot.sandboxMode)
    ].filter((fact): fact is LocalRuntimeFact => Boolean(fact))

    const checkedAt = new Date().toISOString()
    const probe = this.createProviderProbe({
      checkedAt,
      provider: 'codex',
      configDetected: snapshot.configDetected,
      runtimeInstalled: Boolean(runtimeStatus?.installed),
      runtimeLastError: runtimeStatus?.lastError
    })

    return {
      available: probe.status === 'success',
      checkedAt,
      details:
        probe.status === 'success'
          ? 'Codex SDK runtime 与本机配置均已就绪'
          : probe.status === 'failed'
            ? 'Codex 本机链路不完整，请先完成 runtime 安装或修复登录态'
            : 'Codex 运行时已跳过探测，请先补齐本机配置与 runtime',
      configPath: snapshot.configPath,
      authPath: snapshot.authPath,
      files: [
        createFileState('config.toml', snapshot.configPath, await fileExists(snapshot.configPath)),
        createFileState('auth.json', snapshot.authPath, await fileExists(snapshot.authPath))
      ],
      facts,
      configDetected: snapshot.configDetected,
      runtimeInstalled: Boolean(runtimeStatus?.installed),
      runtimeInstallPath: runtimeStatus?.installPath,
      runtimeVersion: runtimeStatus?.installedVersion,
      runtimePackageManager: runtimeStatus?.packageManager,
      runtimeLastError: runtimeStatus?.lastError,
      probe
    }
  }

  async getClaudeStatus(): Promise<LocalRuntimeStatus> {
    const [snapshot, runtimeStatus] = await Promise.all([
      this.getClaudeSnapshot(),
      this.sdkRuntimeManager?.getStatus('claude-code')
    ])
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

    const checkedAt = new Date().toISOString()
    const probe = this.createProviderProbe({
      checkedAt,
      provider: 'claude-code',
      configDetected: snapshot.configDetected,
      runtimeInstalled: Boolean(runtimeStatus?.installed),
      runtimeLastError: runtimeStatus?.lastError
    })

    return {
      available: probe.status === 'success',
      checkedAt,
      details:
        probe.status === 'success'
          ? 'Claude Agent runtime 与本机配置均已就绪'
          : probe.status === 'failed'
            ? 'Claude 本机链路不完整，请先完成 runtime 安装或检查 ~/.claude.json'
            : 'Claude 运行时已跳过探测，请先补齐本机配置与 runtime',
      configPath: snapshot.configPath,
      files: [createFileState('~/.claude.json', snapshot.configPath, snapshot.configDetected)],
      facts,
      configDetected: snapshot.configDetected,
      runtimeInstalled: Boolean(runtimeStatus?.installed),
      runtimeInstallPath: runtimeStatus?.installPath,
      runtimeVersion: runtimeStatus?.installedVersion,
      runtimePackageManager: runtimeStatus?.packageManager,
      runtimeLastError: runtimeStatus?.lastError,
      probe
    }
  }

  async getRuntimeInfo(input: {
    appName: string
    appVersion: string
    platform: NodeJS.Platform
    dataDir: string
  }): Promise<RuntimeInfo> {
    // 两套运行时探测互不依赖，直接并行读取可减少总览页加载时间。
    const [codex, claude, aiSdkRuntime] = await Promise.all([
      this.getCodexStatus(),
      this.getClaudeStatus(),
      this.sdkRuntimeManager?.getState().catch(() => this.createFallbackRuntimeState())
    ])

    return {
      appName: input.appName,
      appVersion: input.appVersion,
      platform: input.platform,
      dataDir: input.dataDir,
      codex,
      claude,
      aiSdkRuntime: aiSdkRuntime ?? this.createFallbackRuntimeState()
    }
  }

  private createFallbackRuntimeState(): AiSdkRuntimeState {
    const checkedAt = new Date().toISOString()
    return {
      checkedAt,
      runtimes: {
        codex: {
          provider: 'codex',
          label: 'Codex SDK',
          packageName: '@openai/codex-sdk',
          desiredVersion: '0.122.0',
          installPath: '',
          installed: false,
          packageManager: 'unavailable'
        },
        'claude-code': {
          provider: 'claude-code',
          label: 'Claude Agent SDK',
          packageName: '@anthropic-ai/claude-agent-sdk',
          desiredVersion: '0.2.118',
          installPath: '',
          installed: false,
          packageManager: 'unavailable'
        }
      }
    }
  }

  private createProviderProbe(input: {
    checkedAt: string
    provider: 'codex' | 'claude-code'
    configDetected: boolean
    runtimeInstalled: boolean
    runtimeLastError?: string
  }): LocalRuntimeStatus['probe'] {
    if (!input.configDetected && !input.runtimeInstalled) {
      return {
        status: 'skipped',
        checkedAt: input.checkedAt,
        message:
          input.provider === 'codex'
            ? '未检测到 ~/.codex 配置，且 runtime 未安装'
            : '未检测到 ~/.claude.json，且 runtime 未安装'
      }
    }

    if (!input.configDetected) {
      return {
        status: 'failed',
        checkedAt: input.checkedAt,
        message:
          input.provider === 'codex'
            ? 'Codex runtime 已安装，但本机 ~/.codex 配置缺失'
            : 'Claude runtime 已安装，但 ~/.claude.json 缺失'
      }
    }

    if (!input.runtimeInstalled) {
      return {
        status: 'failed',
        checkedAt: input.checkedAt,
        message:
          input.provider === 'codex'
            ? '已检测到 Codex 配置，但 AI SDK runtime 尚未安装到应用目录'
            : '已检测到 Claude 配置，但 AI SDK runtime 尚未安装到应用目录'
      }
    }

    if (input.runtimeLastError) {
      return {
        status: 'failed',
        checkedAt: input.checkedAt,
        message: 'runtime 已安装，但最近一次安装或读取存在错误',
        error: input.runtimeLastError
      }
    }

    return {
      status: 'success',
      checkedAt: input.checkedAt,
      message:
        input.provider === 'codex'
          ? 'Codex 本机配置与 runtime 均已具备'
          : 'Claude 本机配置与 runtime 均已具备'
    }
  }
}
