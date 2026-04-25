import { app } from 'electron'
import type { RuntimeInfo } from '../../shared/ipc-contract'
import { AiSdkRuntimeManager } from '../services/ai-sdk-runtime-manager'
import { LocalAiRuntimeService } from '../services/local-ai-runtime-service'

const localAiRuntimeService = new LocalAiRuntimeService(
  new AiSdkRuntimeManager(app.getPath('userData'))
)

export async function getRuntimeInfo(): Promise<RuntimeInfo> {
  return localAiRuntimeService.getRuntimeInfo({
    appName: app.getName(),
    appVersion: app.getVersion(),
    platform: process.platform,
    dataDir: app.getPath('userData')
  })
}
