import type {
  AiProviderKind,
  AiSessionRuntime,
  AiStartChatInput,
  AiStreamEvent
} from '../../shared/ipc-contract'
import { LocalAiRuntimeService } from './local-ai-runtime-service'

/**
 * provider 真正运行所需的最小上下文。
 * 统一成这一层后，具体 bridge 不需要知道 renderer 或 IPC 的存在。
 */
export type AiProviderRunContext = {
  sessionId: string
  input: AiStartChatInput
  abortSignal: AbortSignal
  emit: (event: AiStreamEvent) => Promise<void>
}

/**
 * 所有 AI provider 都被适配为同一接口。
 * `getRuntime` 用于展示和持久化可审计的运行事实；
 * `run` 用于把各 SDK 的原始流翻译成统一事件协议。
 */
export type AiProviderBridge = {
  getRuntime: (input: AiStartChatInput) => Promise<AiSessionRuntime>
  run: (context: AiProviderRunContext) => Promise<void>
}

/**
 * Router 负责做 provider 到 bridge 的映射，让上层会话编排不关心 Codex / Claude 的 SDK 差异。
 */
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

    // 兜底 runtime 主要用于保留可追溯信息；正常情况下 provider 都应命中显式桥接实现。
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
    // 不在这里吞异常，由会话层统一收口状态、历史和错误展示。
    await target.run(context)
  }
}
