import type { BridgeApi } from '../../shared/ipc-contract'

declare global {
  interface Window {
    doggy: BridgeApi
  }
}
