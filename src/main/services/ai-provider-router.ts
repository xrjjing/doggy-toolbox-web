import type {
  AiProviderKind,
  AiSessionRuntime,
  AiStartChatInput,
  AiStreamEvent
} from '../../shared/ipc-contract'
import { LocalAiRuntimeService } from './local-ai-runtime-service'

export type AiProviderRunContext = {
  sessionId: string
  input: AiStartChatInput
  abortSignal: AbortSignal
  emit: (event: AiStreamEvent) => Promise<void>
}

export type AiProviderBridge = {
  getRuntime: (input: AiStartChatInput) => Promise<AiSessionRuntime>
  run: (context: AiProviderRunContext) => Promise<void>
}

export class AiProviderRouter {
  constructor(
    private readonly providers: Record<AiProviderKind, AiProviderBridge>,
    private readonly runtimeService: LocalAiRuntimeService
  ) {}

  async getRuntime(provider: AiProviderKind, input: AiStartChatInput): Promise<AiSessionRuntime> {
    const target = this.providers[provider]
    if (target) {
      return target.getRuntime(input)
    }

    const codex = await this.runtimeService.getCodexSnapshot()
    return {
      transport: 'codex-sdk',
      workingDirectory: input.workingDirectory ?? process.cwd(),
      model: codex.model,
      baseUrl: codex.baseUrl,
      configPath: codex.configPath,
      authPath: codex.authPath,
      serviceTier: codex.serviceTier,
      approvalPolicy: codex.approvalPolicy,
      sandboxMode: codex.sandboxMode
    }
  }

  async run(provider: AiProviderKind, context: AiProviderRunContext): Promise<void> {
    const target = this.providers[provider]
    if (!target) {
      throw new Error(`未找到 AI provider 路由：${provider}`)
    }
    await target.run(context)
  }
}
