import { describe, expect, it } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AiBridgeService } from '../src/main/services/ai-bridge'
import { AiChatHistoryService } from '../src/main/services/ai-chat-history-service'
import { AiProviderRouter, type AiProviderBridge } from '../src/main/services/ai-provider-router'
import { AiSessionService } from '../src/main/services/ai-session-service'
import { LocalAiRuntimeService } from '../src/main/services/local-ai-runtime-service'
import type { AiSessionRuntime } from '../src/shared/ipc-contract'

async function createFixture() {
  const rootDir = await mkdtemp(join(tmpdir(), 'doggy-toolbox-web-ai-'))
  const sentEvents: unknown[] = []
  const historyService = new AiChatHistoryService(rootDir)

  const createMockProvider = (runtime: AiSessionRuntime, output: string): AiProviderBridge => ({
    getRuntime: async () => runtime,
    run: async ({ sessionId, emit }) => {
      await emit({ type: 'delta', sessionId, text: output })
      await emit({ type: 'thinking', sessionId, text: 'reasoning' })
      await emit({
        type: 'tool',
        sessionId,
        toolId: 'tool-1',
        name: 'mock-tool',
        status: 'done',
        text: '工具输出'
      })
      await emit({ type: 'usage', sessionId, inputTokens: 10, outputTokens: 20 })
    }
  })

  const runtimeService = new LocalAiRuntimeService()
  const router = new AiProviderRouter(
    {
      codex: createMockProvider(
        {
          transport: 'codex-sdk',
          workingDirectory: rootDir,
          model: 'gpt-test',
          configPath: `${rootDir}/.codex/config.toml`,
          authPath: `${rootDir}/.codex/auth.json`
        },
        'hello '
      ),
      'claude-code': createMockProvider(
        {
          transport: 'claude-agent-sdk',
          workingDirectory: rootDir,
          configPath: `${rootDir}/.claude.json`
        },
        'claude'
      )
    },
    runtimeService
  )
  let bridge: AiBridgeService | null = null
  const sessionService = new AiSessionService(historyService, router, (event) =>
    bridge?.emit(event)
  )
  bridge = new AiBridgeService(
    () =>
      ({
        webContents: {
          send: (_channel: string, event: unknown) => {
            sentEvents.push(event)
          }
        }
      }) as never,
    sessionService
  )

  return {
    bridge,
    historyService,
    sentEvents
  }
}

async function waitForSessionStatus(
  historyService: AiChatHistoryService,
  sessionId: string,
  status: 'done' | 'error' | 'cancelled'
): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const session = await historyService.getSession(sessionId)
    if (session?.status === status) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`session ${sessionId} did not reach ${status}`)
}

async function createSlowFixture() {
  const rootDir = await mkdtemp(join(tmpdir(), 'doggy-toolbox-web-ai-slow-'))
  const historyService = new AiChatHistoryService(rootDir)
  const runtimeService = new LocalAiRuntimeService()
  const router = new AiProviderRouter(
    {
      codex: {
        getRuntime: async () => ({ transport: 'codex-sdk', workingDirectory: rootDir }),
        run: async ({ abortSignal }) => {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 300)
            abortSignal.addEventListener(
              'abort',
              () => {
                clearTimeout(timer)
                resolve()
              },
              { once: true }
            )
          })
        }
      },
      'claude-code': {
        getRuntime: async () => ({ transport: 'claude-agent-sdk', workingDirectory: rootDir }),
        run: async ({ abortSignal }) => {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 300)
            abortSignal.addEventListener(
              'abort',
              () => {
                clearTimeout(timer)
                resolve()
              },
              { once: true }
            )
          })
        }
      }
    },
    runtimeService
  )
  let bridge: AiBridgeService | null = null
  const sessionService = new AiSessionService(historyService, router, (event) =>
    bridge?.emit(event)
  )
  bridge = new AiBridgeService(() => null, sessionService)

  return {
    bridge,
    historyService
  }
}

describe('AiBridgeService', () => {
  it('persists structured chat history from mock codex provider route', async () => {
    const { bridge, historyService, sentEvents } = await createFixture()

    const result = await bridge.startChat({
      provider: 'codex',
      messages: [{ role: 'user', content: '介绍一下项目' }]
    })
    await waitForSessionStatus(historyService, result.sessionId, 'done')

    const session = await historyService.getSession(result.sessionId)
    const state = await historyService.getState()

    expect(session).toMatchObject({
      id: result.sessionId,
      provider: 'codex',
      status: 'done',
      phase: 'completed',
      output: 'hello ',
      thinking: 'reasoning',
      runtime: {
        transport: 'codex-sdk',
        model: 'gpt-test'
      },
      usage: {
        inputTokens: 10,
        outputTokens: 20
      }
    })
    expect(session?.tools).toEqual([
      {
        id: 'tool-1',
        name: 'mock-tool',
        status: 'done',
        text: '工具输出'
      }
    ])
    expect(state.sessions).toHaveLength(1)
    expect(sentEvents.some((event) => (event as { type?: string }).type === 'done')).toBe(true)
  })

  it('routes claude-code through provider router', async () => {
    const { bridge, historyService } = await createFixture()
    const result = await bridge.startChat({
      provider: 'claude-code',
      messages: [{ role: 'user', content: 'Claude 测试' }]
    })
    await waitForSessionStatus(historyService, result.sessionId, 'done')

    const session = await historyService.getSession(result.sessionId)

    expect(session).toMatchObject({
      provider: 'claude-code',
      output: 'claude',
      runtime: {
        transport: 'claude-agent-sdk'
      }
    })
  })

  it('marks cancelled session when cancel is called', async () => {
    const { bridge, historyService } = await createSlowFixture()
    const result = await bridge.startChat({
      provider: 'claude-code',
      messages: [{ role: 'user', content: '取消测试' }]
    })

    const cancelResult = await bridge.cancelChat(result.sessionId)
    const session = await historyService.getSession(result.sessionId)

    expect(cancelResult.ok).toBe(true)
    expect(session?.status).toBe('cancelled')
    expect(session?.phase).toBe('cancelled')
  })
})
