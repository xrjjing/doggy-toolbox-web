export type RuntimeInfo = {
  appName: string
  appVersion: string
  platform: NodeJS.Platform
  dataDir: string
  codex: LocalRuntimeStatus
  claude: LocalRuntimeStatus
}

export type LocalRuntimeStatus = {
  available: boolean
  checkedAt: string
  details: string
  configPath?: string
}

export type AiProviderKind = 'codex' | 'claude-code'

export type AiChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AiStartChatInput = {
  provider: AiProviderKind
  messages: AiChatMessage[]
  workingDirectory?: string
}

export type AiStreamEvent =
  | {
      type: 'start'
      sessionId: string
      provider: AiProviderKind
    }
  | {
      type: 'delta'
      sessionId: string
      text: string
    }
  | {
      type: 'thinking'
      sessionId: string
      text: string
    }
  | {
      type: 'tool'
      sessionId: string
      name: string
      status: 'start' | 'done' | 'error'
      text?: string
    }
  | {
      type: 'usage'
      sessionId: string
      inputTokens?: number
      outputTokens?: number
    }
  | {
      type: 'done'
      sessionId: string
    }
  | {
      type: 'error'
      sessionId: string
      message: string
    }

export type AiStartChatResult = {
  sessionId: string
}

export type CommandTab = {
  id: string
  name: string
  order: number
  createdAt: string
  updatedAt: string
}

export type CommandRecord = {
  id: string
  title: string
  description: string
  lines: string[]
  tabId: string
  tags: string[]
  order: number
  createdAt: string
  updatedAt: string
}

export type CommandTabSaveInput = {
  id?: string
  name: string
}

export type CommandSaveInput = {
  id?: string
  title: string
  description?: string
  lines: string[]
  tabId?: string
  tags?: string[]
}

export type CommandModuleState = {
  storageFile: string
  defaultTabId: string
  updatedAt: string
  tabs: CommandTab[]
  commands: CommandRecord[]
}

export type BridgeApi = {
  getRuntimeInfo: () => Promise<RuntimeInfo>
  aiStartChat: (input: AiStartChatInput) => Promise<AiStartChatResult>
  aiCancelChat: (sessionId: string) => Promise<{ ok: boolean }>
  onAiStreamEvent: (handler: (event: AiStreamEvent) => void) => () => void
  getCommandsState: () => Promise<CommandModuleState>
  saveCommandTab: (input: CommandTabSaveInput) => Promise<CommandTab>
  saveCommand: (input: CommandSaveInput) => Promise<CommandRecord>
  deleteCommand: (commandId: string) => Promise<{ ok: boolean }>
}
