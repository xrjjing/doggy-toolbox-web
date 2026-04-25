#!/usr/bin/env node

import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PROMPT = '只回复 DOGGY_AI_SMOKE_OK，不要调用工具，不要修改文件。'
const EXPECTED = 'DOGGY_AI_SMOKE_OK'
const TIMEOUT_MS = 60_000

const DEFAULT_RUNTIME_ROOT = join(
  homedir(),
  'Library',
  'Application Support',
  'doggy-toolbox-web',
  'ai-runtimes'
)

async function pathExists(path) {
  try {
    await access(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

async function resolveRuntimeImport(provider) {
  const runtimeRoot = process.env.DOGGY_AI_RUNTIME_ROOT || DEFAULT_RUNTIME_ROOT
  const target =
    provider === 'codex'
      ? {
          label: 'Codex SDK',
          path: join(
            runtimeRoot,
            'codex-sdk',
            'node_modules',
            '@openai',
            'codex-sdk',
            'dist',
            'index.js'
          )
        }
      : {
          label: 'Claude Agent SDK',
          path: join(
            runtimeRoot,
            'claude-agent-sdk',
            'node_modules',
            '@anthropic-ai',
            'claude-agent-sdk',
            'sdk.mjs'
          )
        }

  if (!(await pathExists(target.path))) {
    throw new Error(`${target.label} 尚未安装。请先在应用的 AI 设置页安装对应 runtime。`)
  }

  return pathToFileURL(target.path).href
}

function createTimeoutController() {
  const abortController = new AbortController()
  const timer = setTimeout(() => abortController.abort(), TIMEOUT_MS)
  return {
    signal: abortController.signal,
    abortController,
    cleanup: () => clearTimeout(timer)
  }
}

function assertSmokeResult(provider, value, extra = {}) {
  if (!String(value || '').includes(EXPECTED)) {
    throw new Error(`${provider} smoke test did not include ${EXPECTED}`)
  }

  console.log(
    JSON.stringify(
      {
        provider,
        ok: true,
        expected: EXPECTED,
        ...extra
      },
      null,
      2
    )
  )
}

async function smokeCodex() {
  const { Codex } = await import(await resolveRuntimeImport('codex'))
  const { signal, cleanup } = createTimeoutController()

  try {
    const codex = new Codex()
    const thread = codex.startThread({
      workingDirectory: process.cwd(),
      skipGitRepoCheck: true,
      approvalPolicy: 'never',
      sandboxMode: 'read-only',
      networkAccessEnabled: false
    })
    const turn = await thread.run(PROMPT, { signal })

    assertSmokeResult('codex', turn.finalResponse, {
      threadId: thread.id,
      finalResponse: turn.finalResponse,
      usage: turn.usage
    })
  } finally {
    cleanup()
  }
}

async function smokeClaude() {
  const { query } = await import(await resolveRuntimeImport('claude'))
  const { abortController, cleanup } = createTimeoutController()
  const messages = []

  try {
    const stream = query({
      prompt: PROMPT,
      options: {
        cwd: process.cwd(),
        abortController,
        settingSources: ['user', 'project', 'local'],
        permissionMode: 'dontAsk',
        stderr: (data) => process.stderr.write(data)
      }
    })

    for await (const message of stream) {
      messages.push(message)
      if (message.type === 'result') {
        break
      }
    }

    const result = messages.find((message) => message.type === 'result')
    if (!result || result.subtype !== 'success') {
      const reason = result ? JSON.stringify(result) : 'missing result message'
      throw new Error(`Claude smoke test failed: ${reason}`)
    }

    assertSmokeResult('claude-code', result.result, {
      sessionId: result.session_id,
      finalResponse: result.result,
      usage: result.usage,
      totalCostUsd: result.total_cost_usd,
      fastModeState: result.fast_mode_state
    })
  } finally {
    cleanup()
  }
}

async function main() {
  const target = process.argv[2] || 'all'

  if (target !== 'codex' && target !== 'claude' && target !== 'all') {
    throw new Error('Usage: npm run smoke:ai -- [codex|claude|all]')
  }

  if (target === 'codex' || target === 'all') {
    await smokeCodex()
  }

  if (target === 'claude' || target === 'all') {
    await smokeClaude()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
})
