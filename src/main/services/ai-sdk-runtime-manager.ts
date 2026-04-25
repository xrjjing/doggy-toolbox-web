import { access, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { constants, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  AiProviderKind,
  AiSdkRuntimeOperationResult,
  AiSdkRuntimeState,
  AiSdkRuntimeStatus
} from '../../shared/ipc-contract'

type AiRuntimeManifest = {
  provider: AiProviderKind
  packageName: string
  desiredVersion: string
  installedAt: string
  updatedAt: string
}

type RuntimeDefinition = {
  provider: AiProviderKind
  label: string
  packageName: string
  desiredVersion: string
  directoryName: string
  entryFile: string
}

type PackageManagerCommand = {
  kind: AiSdkRuntimeStatus['packageManager']
  command: string
  args: string[]
}

const RUNTIME_DEFINITIONS: Record<AiProviderKind, RuntimeDefinition> = {
  codex: {
    provider: 'codex',
    label: 'Codex SDK',
    packageName: '@openai/codex-sdk',
    desiredVersion: '0.122.0',
    directoryName: 'codex-sdk',
    entryFile: 'dist/index.js'
  },
  'claude-code': {
    provider: 'claude-code',
    label: 'Claude Agent SDK',
    packageName: '@anthropic-ai/claude-agent-sdk',
    desiredVersion: '0.2.118',
    directoryName: 'claude-agent-sdk',
    entryFile: 'sdk.mjs'
  }
}

function normalizeProvider(provider: AiProviderKind): RuntimeDefinition {
  const definition = RUNTIME_DEFINITIONS[provider]
  if (!definition) {
    throw new Error(`不支持的 AI SDK 运行时：${provider}`)
  }
  return definition
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function calculateDirectorySize(path: string): Promise<number> {
  if (!(await pathExists(path))) {
    return 0
  }

  const entries = await readdir(path, { withFileTypes: true })
  let total = 0
  for (const entry of entries) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) {
      total += await calculateDirectorySize(child)
      continue
    }
    if (entry.isFile() || entry.isSymbolicLink()) {
      total += (await stat(child)).size
    }
  }
  return total
}

function runCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<{ commandText: string; stdout: string; stderr: string }> {
  const commandText = [command, ...args].join(' ')
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      env: {
        ...process.env,
        // 用户数据目录里的 runtime package 没有 pnpm workspace，显式关闭 workspace 向上查找更稳定。
        npm_config_link_workspace_packages: 'false'
      }
    })
    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => reject(error))
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ commandText, stdout, stderr })
        return
      }
      const error = new Error(`${commandText} 执行失败，退出码 ${code}\n${stderr || stdout}`)
      Object.assign(error, { stdout, stderr, commandText })
      reject(error)
    })
  })
}

/**
 * 管理按需安装的 AI SDK runtime。
 *
 * 这些 SDK 不再打进主应用依赖树，而是安装到 Electron `userData/ai-runtimes`。
 * 这样 GitHub 用户默认只下载基础工具箱，真正点开 AI 时再按需安装对应 provider。
 */
export class AiSdkRuntimeManager {
  private readonly runtimeRoot: string

  constructor(userDataPath: string) {
    this.runtimeRoot = join(userDataPath, 'ai-runtimes')
  }

  getInstallPath(provider: AiProviderKind): string {
    return join(this.runtimeRoot, normalizeProvider(provider).directoryName)
  }

  async getImportUrl(provider: AiProviderKind): Promise<string> {
    const status = await this.getStatus(provider)
    if (!status.installed) {
      throw new Error(
        `${status.label} 尚未安装。请先到 AI 设置页点击“安装”，安装后再使用该 AI provider。`
      )
    }

    const definition = normalizeProvider(provider)
    const packagePath = join(
      status.installPath,
      'node_modules',
      status.packageName,
      definition.entryFile
    )
    return pathToFileURL(packagePath).href
  }

  async getState(): Promise<AiSdkRuntimeState> {
    const [codex, claude] = await Promise.all([
      this.getStatus('codex'),
      this.getStatus('claude-code')
    ])
    return {
      checkedAt: new Date().toISOString(),
      runtimes: {
        codex,
        'claude-code': claude
      }
    }
  }

  async getStatus(provider: AiProviderKind): Promise<AiSdkRuntimeStatus> {
    const definition = normalizeProvider(provider)
    const installPath = this.getInstallPath(provider)
    const packageJsonPath = join(
      installPath,
      'node_modules',
      definition.packageName,
      'package.json'
    )
    const manifestPath = join(installPath, '.doggy-ai-runtime.json')
    const installed = await pathExists(packageJsonPath)
    let installedVersion: string | undefined
    let updatedAt: string | undefined
    let lastError: string | undefined

    if (installed) {
      try {
        const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
          version?: unknown
        }
        installedVersion = typeof packageJson.version === 'string' ? packageJson.version : undefined
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
      }
    }

    if (await pathExists(manifestPath)) {
      try {
        const manifest = JSON.parse(
          await readFile(manifestPath, 'utf8')
        ) as Partial<AiRuntimeManifest>
        updatedAt = typeof manifest.updatedAt === 'string' ? manifest.updatedAt : undefined
      } catch {
        // manifest 只用于展示，不影响 SDK 本身是否可用。
      }
    }

    return {
      provider,
      label: definition.label,
      packageName: definition.packageName,
      desiredVersion: definition.desiredVersion,
      installPath,
      installed,
      installedVersion,
      packageManager: await this.detectPackageManagerKind(),
      sizeBytes: installed ? await calculateDirectorySize(installPath) : 0,
      updatedAt,
      lastError
    }
  }

  async install(provider: AiProviderKind): Promise<AiSdkRuntimeOperationResult> {
    return this.installOrUpdate(provider)
  }

  async update(provider: AiProviderKind): Promise<AiSdkRuntimeOperationResult> {
    return this.installOrUpdate(provider)
  }

  async uninstall(provider: AiProviderKind): Promise<AiSdkRuntimeOperationResult> {
    const definition = normalizeProvider(provider)
    const installPath = this.getInstallPath(provider)
    await rm(installPath, { recursive: true, force: true })
    return {
      ok: true,
      status: await this.getStatus(provider),
      command: `删除 ${definition.label} 运行时目录`
    }
  }

  private async installOrUpdate(provider: AiProviderKind): Promise<AiSdkRuntimeOperationResult> {
    const definition = normalizeProvider(provider)
    const installPath = this.getInstallPath(provider)
    await mkdir(installPath, { recursive: true })

    const packageJson = {
      private: true,
      type: 'module',
      dependencies: {
        [definition.packageName]: definition.desiredVersion
      }
    }
    await writeFile(join(installPath, 'package.json'), JSON.stringify(packageJson, null, 2))

    const command = await this.getPackageManagerCommand()
    if (command.kind === 'unavailable') {
      throw new Error('未检测到 pnpm、corepack 或 npm，无法按需安装 AI SDK 运行时。')
    }
    const result = await runCommand(command.command, command.args, installPath)
    const now = new Date().toISOString()
    const manifest: AiRuntimeManifest = {
      provider,
      packageName: definition.packageName,
      desiredVersion: definition.desiredVersion,
      installedAt: now,
      updatedAt: now
    }
    await writeFile(join(installPath, '.doggy-ai-runtime.json'), JSON.stringify(manifest, null, 2))

    return {
      ok: true,
      status: await this.getStatus(provider),
      command: result.commandText,
      stdout: result.stdout,
      stderr: result.stderr
    }
  }

  private async detectPackageManagerKind(): Promise<AiSdkRuntimeStatus['packageManager']> {
    return (await this.getPackageManagerCommand()).kind
  }

  private async getPackageManagerCommand(): Promise<PackageManagerCommand> {
    const bundledPnpm = this.getBundledPnpmPath()
    if (bundledPnpm) {
      return { kind: 'bundled-pnpm', command: bundledPnpm, args: ['install', '--prod'] }
    }
    if (await this.commandAvailable('pnpm')) {
      return { kind: 'pnpm', command: 'pnpm', args: ['install', '--prod'] }
    }
    if (await this.commandAvailable('corepack')) {
      return { kind: 'corepack-pnpm', command: 'corepack', args: ['pnpm', 'install', '--prod'] }
    }
    if (await this.commandAvailable('npm')) {
      return { kind: 'npm', command: 'npm', args: ['install', '--omit=dev'] }
    }
    return { kind: 'unavailable', command: 'pnpm', args: ['install', '--prod'] }
  }

  private getBundledPnpmPath(): string | null {
    // 打包产物优先使用应用随包附带的独立 pnpm 二进制，避免要求最终用户先安装 pnpm/corepack。
    // 开发态仍允许回退到系统 pnpm / corepack pnpm / npm，不污染当前仓库脚本入口。
    const candidates: string[] = []
    const executableName = process.platform === 'win32' ? 'pnpm.exe' : 'pnpm'
    const platformArchDir = `${process.platform}-${process.arch}`

    if (process.resourcesPath) {
      candidates.push(
        join(process.resourcesPath, 'runtime-installers', platformArchDir, executableName)
      )
    }
    candidates.push(
      join(process.cwd(), 'resources', 'runtime-installers', platformArchDir, executableName)
    )

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate
      }
    }
    return null
  }

  private async commandAvailable(command: string): Promise<boolean> {
    try {
      await mkdir(this.runtimeRoot, { recursive: true })
      await runCommand(command, ['--version'], this.runtimeRoot)
      return true
    } catch {
      return false
    }
  }
}
