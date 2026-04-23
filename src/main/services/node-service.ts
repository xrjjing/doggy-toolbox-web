import { randomUUID } from 'node:crypto'
import type { NodeModuleState, NodeRecord, NodeSaveInput } from '../../shared/ipc-contract'
import { ensureAppDataLayout, resolveAppDataPaths } from './app-data'
import { JsonFileRepository } from './json-repository'

type StoredNodeState = {
  version: number
  updatedAt: string
  nodes: NodeRecord[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function createDefaultState(): StoredNodeState {
  return {
    version: 1,
    updatedAt: nowIso(),
    nodes: []
  }
}

function sanitizeText(value: string | undefined): string {
  return (value ?? '').replace(/\r/g, '').trim()
}

function sanitizeMultiline(value: string | undefined): string {
  return (value ?? '').replace(/\r/g, '').trim()
}

function sanitizeTags(tags: string[] | undefined): string[] {
  return Array.from(new Set((tags ?? []).map((tag) => sanitizeText(tag)).filter(Boolean)))
}

function normalizePort(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed)
    }
  }

  return 0
}

function sortNodes(nodes: NodeRecord[]): NodeRecord[] {
  return [...nodes].sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order
    return left.createdAt.localeCompare(right.createdAt)
  })
}

function isNodeRecord(value: unknown): value is NodeRecord {
  return typeof value === 'object' && value !== null && 'id' in value
}

function normalizeState(raw: StoredNodeState | null | undefined): StoredNodeState {
  const fallback = createDefaultState()
  const source = raw ?? fallback
  const timestamp = source.updatedAt || fallback.updatedAt
  const nodes = (source.nodes ?? []).filter(isNodeRecord).map((node, index) => ({
    id: node.id || randomUUID(),
    name: sanitizeText(node.name) || `未命名节点 ${index + 1}`,
    type: sanitizeText(node.type) || 'custom',
    server: sanitizeText(node.server),
    port: normalizePort(node.port),
    rawLink: sanitizeMultiline(node.rawLink),
    configText: sanitizeMultiline(node.configText),
    tags: sanitizeTags(node.tags),
    order: Number.isFinite(node.order) ? node.order : index,
    createdAt: node.createdAt || timestamp,
    updatedAt: node.updatedAt || timestamp
  }))

  return {
    version: 1,
    updatedAt: timestamp,
    nodes: sortNodes(nodes)
  }
}

export class NodeService {
  private readonly paths
  private readonly repository

  constructor(rootDir: string) {
    this.paths = resolveAppDataPaths(rootDir)
    this.repository = new JsonFileRepository<StoredNodeState>(
      this.paths.files.nodes,
      createDefaultState
    )
  }

  async getState(): Promise<NodeModuleState> {
    const state = await this.readState()
    return this.toModuleState(state)
  }

  async saveNode(input: NodeSaveInput): Promise<NodeRecord> {
    const name = sanitizeText(input.name)
    const type = sanitizeText(input.type)
    const server = sanitizeText(input.server)
    const port = normalizePort(input.port)
    const rawLink = sanitizeMultiline(input.rawLink)
    const configText = sanitizeMultiline(input.configText)
    const tags = sanitizeTags(input.tags)

    if (!name) {
      throw new Error('节点名称不能为空')
    }

    if (!type) {
      throw new Error('节点类型不能为空')
    }

    if (!server) {
      throw new Error('服务器地址不能为空')
    }

    if (!(port >= 1 && port <= 65535)) {
      throw new Error('端口号必须在 1 到 65535 之间')
    }

    const timestamp = nowIso()
    let savedNode: NodeRecord | null = null

    await this.updateState((state) => {
      const nodes = [...state.nodes]
      const existingIndex = nodes.findIndex((node) => node.id === input.id)

      if (existingIndex >= 0) {
        const current = nodes[existingIndex]
        savedNode = {
          ...current,
          name,
          type,
          server,
          port,
          rawLink,
          configText,
          tags,
          updatedAt: timestamp
        }
        nodes[existingIndex] = savedNode
      } else {
        savedNode = {
          id: randomUUID(),
          name,
          type,
          server,
          port,
          rawLink,
          configText,
          tags,
          order: nodes.reduce((maxOrder, node) => Math.max(maxOrder, node.order), -1) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        nodes.push(savedNode)
      }

      return {
        ...state,
        updatedAt: timestamp,
        nodes: sortNodes(nodes)
      }
    })

    if (!savedNode) {
      throw new Error('节点保存失败')
    }

    return savedNode
  }

  async deleteNode(nodeId: string): Promise<{ ok: boolean }> {
    const normalizedId = sanitizeText(nodeId)
    if (!normalizedId) {
      return { ok: false }
    }

    let removed = false

    await this.updateState((state) => {
      const nodes = state.nodes.filter((node) => {
        const keep = node.id !== normalizedId
        if (!keep) removed = true
        return keep
      })

      if (!removed) {
        return state
      }

      return {
        ...state,
        updatedAt: nowIso(),
        nodes: sortNodes(nodes)
      }
    })

    return { ok: removed }
  }

  async exportBackupSection(): Promise<Pick<NodeModuleState, 'nodes'>> {
    const state = await this.readState()
    return {
      nodes: [...state.nodes]
    }
  }

  async restoreBackupSection(section: Pick<NodeModuleState, 'nodes'>): Promise<NodeModuleState> {
    const restored = normalizeState({
      version: 1,
      updatedAt: nowIso(),
      nodes: section.nodes ?? []
    })
    await ensureAppDataLayout(this.paths)
    await this.repository.write(restored)
    return this.toModuleState(restored)
  }

  private async readState(): Promise<StoredNodeState> {
    await ensureAppDataLayout(this.paths)
    const raw = await this.repository.read()
    const normalized = normalizeState(raw)

    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      await this.repository.write(normalized)
    }

    return normalized
  }

  private async updateState(
    mutator: (state: StoredNodeState) => StoredNodeState | Promise<StoredNodeState>
  ): Promise<StoredNodeState> {
    await ensureAppDataLayout(this.paths)

    return this.repository.update(async (raw) => {
      const normalized = normalizeState(raw)
      return normalizeState(await mutator(normalized))
    })
  }

  private toModuleState(state: StoredNodeState): NodeModuleState {
    return {
      storageFile: this.paths.files.nodes,
      updatedAt: state.updatedAt,
      nodes: sortNodes(state.nodes)
    }
  }
}
