import { describe, expect, it } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AiBridgeService } from '../src/main/services/ai-bridge'
import { AiChatHistoryService } from '../src/main/services/ai-chat-history-service'

async function createFixture() {
  const rootDir = await mkdtemp(join(tmpdir(), 'doggy-toolbox-web-ai-'))
  const sentEvents: unknown[] = []
  const historyService = new AiChatHistoryService(rootDir)
  const bridge = new AiBridgeService(
    () =>
      ({
        webContents: {
          send: (_channel: string, event: unknown) => {
            sentEvents.push(event)
          }
        }
      }) as never,
    historyService,
    {
      codex: async ({ sessionId, emit }) => {
        await emit({ type: 'delta', sessionId, text: 'hello ' })
        await emit({ type: 'thinking', sessionId, text: 'world' })
      },
      claudeCode: async ({ sessionId, emit }) => {
        await emit({ type: 'delta', sessionId, text: 'claude' })
      }
    }
  )

  return {
    bridge,
    historyService,
    sentEvents
  }
}

describe('AiBridgeService', () => {
  it('persists chat history from mock codex runner', async () => {
    const { bridge, historyService, sentEvents } = await createFixture()

    const result = await bridge.startChat({
      provider: 'codex',
      messages: [{ role: 'user', content: '介绍一下项目' }]
    })
    await new Promise((resolve) => setTimeout(resolve, 10))

    const session = await historyService.getSession(result.sessionId)
    const state = await historyService.getState()

    expect(session).toMatchObject({
      id: result.sessionId,
      provider: 'codex',
      status: 'done'
    })
    expect(session?.output).toBe('hello world')
    expect(state.sessions).toHaveLength(1)
    expect(sentEvents.some((event) => (event as { type?: string }).type === 'done')).toBe(true)
  })

  it('marks cancelled session when cancel is called', async () => {
    const { bridge, historyService } = await createFixture()
    const result = await bridge.startChat({
      provider: 'claude-code',
      messages: [{ role: 'user', content: '取消测试' }]
    })

    const cancelResult = await bridge.cancelChat(result.sessionId)
    const session = await historyService.getSession(result.sessionId)

    expect(cancelResult.ok).toBe(true)
    expect(session?.status).toBe('cancelled')
  })
})
