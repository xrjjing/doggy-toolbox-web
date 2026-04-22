import { app } from 'electron'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { LocalRuntimeStatus, RuntimeInfo } from '../../shared/ipc-contract'

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

export async function getCodexStatus(): Promise<LocalRuntimeStatus> {
  const configPath = join(homedir(), '.codex', 'config.toml')
  const authPath = join(homedir(), '.codex', 'auth.json')
  const [hasConfig, hasAuth] = await Promise.all([fileExists(configPath), fileExists(authPath)])

  return {
    available: hasConfig || hasAuth,
    checkedAt: new Date().toISOString(),
    details: hasConfig || hasAuth ? '已检测到本机 Codex 配置或登录态' : '未检测到 ~/.codex 配置',
    configPath
  }
}

export async function getClaudeStatus(): Promise<LocalRuntimeStatus> {
  const configPath = join(homedir(), '.claude.json')
  const hasConfig = await fileExists(configPath)

  return {
    available: hasConfig,
    checkedAt: new Date().toISOString(),
    details: hasConfig ? '已检测到本机 Claude Code 配置' : '未检测到 ~/.claude.json',
    configPath
  }
}

export async function getRuntimeInfo(): Promise<RuntimeInfo> {
  const [codex, claude] = await Promise.all([getCodexStatus(), getClaudeStatus()])

  return {
    appName: app.getName(),
    appVersion: app.getVersion(),
    platform: process.platform,
    dataDir: app.getPath('userData'),
    codex,
    claude
  }
}
