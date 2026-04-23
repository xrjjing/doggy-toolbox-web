import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { resolveAppDataPaths } from '../src/main/services/app-data'
import { HttpCollectionService } from '../src/main/services/http-collection-service'

async function createService(): Promise<{ rootDir: string; service: HttpCollectionService }> {
  const rootDir = await mkdtemp(join(tmpdir(), 'doggy-toolbox-web-http-collections-'))
  return {
    rootDir,
    service: new HttpCollectionService(rootDir)
  }
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => resolve(body))
    request.on('error', reject)
  })
}

async function createEchoServer(): Promise<{
  baseUrl: string
  close: () => Promise<void>
}> {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const body = await readRequestBody(request)
    response.setHeader('content-type', 'application/json')
    response.end(
      JSON.stringify({
        method: request.method,
        url: request.url,
        token: request.headers['x-token'],
        contentType: request.headers['content-type'],
        body
      })
    )
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address() as AddressInfo

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
  }
}

describe('HttpCollectionService', () => {
  it('bootstraps default collection on first read', async () => {
    const { rootDir, service } = await createService()

    const state = await service.getState()
    const paths = resolveAppDataPaths(rootDir)

    expect(state.storageFile).toBe(paths.files.httpCollections)
    expect(state.defaultCollectionId).toBe('default')
    expect(state.collections.map((collection) => collection.id)).toContain('default')

    const fileContent = await readFile(paths.files.httpCollections, 'utf8')
    expect(JSON.parse(fileContent)).toMatchObject({
      version: 1
    })
  })

  it('saves collections, requests and environments into repository file', async () => {
    const { service } = await createService()

    const collection = await service.saveCollection({
      name: '用户服务',
      description: '用户中心接口'
    })
    const request = await service.saveRequest({
      collectionId: collection.id,
      name: '查询用户',
      method: 'POST',
      url: 'https://api.example.com/users/{{userId}}',
      headers: [{ key: 'Authorization', value: 'Bearer {{token}}' }],
      params: [{ key: 'verbose', value: 'true' }],
      body: { type: 'json', content: '{"id":"{{userId}}"}' },
      auth: { type: 'bearer', token: '{{token}}' },
      tags: ['用户', '查询', '用户']
    })
    const environment = await service.saveEnvironment({
      name: '测试环境',
      variables: [
        { key: 'baseUrl', value: 'https://api.example.com' },
        { key: 'token', value: 'demo' }
      ]
    })
    const state = await service.getState()

    expect(request).toMatchObject({
      collectionId: collection.id,
      name: '查询用户',
      method: 'POST',
      tags: ['用户', '查询']
    })
    expect(environment.variables.map((item) => item.key)).toEqual(['baseUrl', 'token'])
    expect(state.collections.some((item) => item.name === '用户服务')).toBe(true)
    expect(state.requests).toHaveLength(1)
    expect(state.environments).toHaveLength(1)
  })

  it('updates and deletes requests and environments', async () => {
    const { service } = await createService()

    const request = await service.saveRequest({
      name: '旧请求',
      method: 'GET',
      url: 'https://old.example.com'
    })
    const updated = await service.saveRequest({
      id: request.id,
      name: '新请求',
      method: 'PATCH',
      url: 'https://new.example.com',
      body: { type: 'json', content: '{"ok":true}' }
    })
    const environment = await service.saveEnvironment({
      name: '本地环境',
      variables: [{ key: 'host', value: 'localhost' }]
    })
    const requestDeleteResult = await service.deleteRequest(updated.id)
    const environmentDeleteResult = await service.deleteEnvironment(environment.id)
    const state = await service.getState()

    expect(updated).toMatchObject({
      id: request.id,
      name: '新请求',
      method: 'PATCH',
      url: 'https://new.example.com'
    })
    expect(requestDeleteResult.ok).toBe(true)
    expect(environmentDeleteResult.ok).toBe(true)
    expect(state.requests).toEqual([])
    expect(state.environments).toEqual([])
  })

  it('restores backup section and normalizes invalid collection references', async () => {
    const { service } = await createService()

    await service.restoreBackupSection({
      collections: [],
      requests: [
        {
          id: 'req_1',
          collectionId: 'missing',
          name: '导入请求',
          method: 'POST',
          url: 'https://api.example.com',
          description: '',
          headers: [],
          params: [],
          body: { type: 'none', content: '' },
          auth: { type: 'none', token: '', username: '', password: '' },
          tags: [],
          order: 0,
          createdAt: '',
          updatedAt: ''
        }
      ],
      environments: []
    })
    const state = await service.getState()

    expect(state.collections.map((collection) => collection.id)).toContain('default')
    expect(state.requests[0].collectionId).toBe('default')
  })

  it('resolves request variables before execution', async () => {
    const { service } = await createService()
    const environment = await service.saveEnvironment({
      name: '测试环境',
      variables: [
        { key: 'baseUrl', value: 'https://api.example.com' },
        { key: 'userId', value: '42' },
        { key: 'token', value: 'demo-token' }
      ]
    })
    const request = await service.saveRequest({
      name: '变量请求',
      method: 'POST',
      url: '{{baseUrl}}/users/{{userId}}',
      headers: [{ key: 'X-User', value: '{{userId}}' }],
      params: [
        { key: 'verbose', value: 'true' },
        { key: 'missing', value: '{{missingVar}}' }
      ],
      body: { type: 'json', content: '{"id":"{{userId}}"}' },
      auth: { type: 'bearer', token: '{{token}}' }
    })

    const resolved = await service.resolveRequest({
      requestId: request.id,
      environmentId: environment.id
    })

    expect(resolved).toMatchObject({
      requestId: request.id,
      environmentId: environment.id,
      method: 'POST',
      bodyType: 'json',
      body: '{"id":"42"}',
      unresolvedVariables: ['missingVar']
    })
    expect(resolved.url).toBe(
      'https://api.example.com/users/42?verbose=true&missing=%7B%7BmissingVar%7D%7D'
    )
    expect(resolved.headers).toEqual(
      expect.arrayContaining([
        { key: 'X-User', value: '42' },
        { key: 'Authorization', value: 'Bearer demo-token' },
        { key: 'Content-Type', value: 'application/json' }
      ])
    )
  })

  it('executes request through local HTTP server without renderer fetch', async () => {
    const echoServer = await createEchoServer()
    try {
      const { service } = await createService()
      const environment = await service.saveEnvironment({
        name: '本地环境',
        variables: [
          { key: 'baseUrl', value: echoServer.baseUrl },
          { key: 'pathId', value: 'users' },
          { key: 'query', value: 'doggy' },
          { key: 'token', value: 'local-token' }
        ]
      })
      const request = await service.saveRequest({
        name: '本地回显',
        method: 'POST',
        url: '{{baseUrl}}/echo/{{pathId}}',
        headers: [{ key: 'X-Token', value: '{{token}}' }],
        params: [{ key: 'q', value: '{{query}}' }],
        body: { type: 'text', content: 'hello {{query}}' }
      })

      const result = await service.executeRequest({
        requestId: request.id,
        environmentId: environment.id,
        timeoutMs: 5000
      })
      const parsedBody = JSON.parse(result.body)
      const state = await service.getState()

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
      expect(result.resolvedRequest.url).toContain('/echo/users?q=doggy')
      expect(parsedBody).toMatchObject({
        method: 'POST',
        url: '/echo/users?q=doggy',
        token: 'local-token',
        body: 'hello doggy'
      })
      expect(state.history).toHaveLength(1)
      expect(state.history[0]).toMatchObject({
        requestId: request.id,
        requestName: '本地回显',
        environmentName: '本地环境',
        status: 200,
        ok: true
      })
      expect(JSON.parse(state.history[0].responseBody)).toMatchObject({
        url: '/echo/users?q=doggy'
      })
    } finally {
      await echoServer.close()
    }
  })

  it('clears execution history for selected request only', async () => {
    const echoServer = await createEchoServer()
    try {
      const { service } = await createService()
      const firstRequest = await service.saveRequest({
        name: '第一条',
        method: 'GET',
        url: `${echoServer.baseUrl}/first`
      })
      const secondRequest = await service.saveRequest({
        name: '第二条',
        method: 'GET',
        url: `${echoServer.baseUrl}/second`
      })
      await service.executeRequest({ requestId: firstRequest.id })
      await service.executeRequest({ requestId: secondRequest.id })

      const result = await service.clearHistory({ requestId: firstRequest.id })
      const state = await service.getState()

      expect(result).toEqual({ ok: true, removed: 1 })
      expect(state.history).toHaveLength(1)
      expect(state.history[0].requestId).toBe(secondRequest.id)
    } finally {
      await echoServer.close()
    }
  })

  it('executes collection requests sequentially in batch', async () => {
    const echoServer = await createEchoServer()
    try {
      const { service } = await createService()
      const collection = await service.saveCollection({
        name: '批量集合'
      })
      await service.saveRequest({
        collectionId: collection.id,
        name: '批量第一条',
        method: 'GET',
        url: `${echoServer.baseUrl}/batch/one`
      })
      await service.saveRequest({
        collectionId: collection.id,
        name: '批量第二条',
        method: 'POST',
        url: `${echoServer.baseUrl}/batch/two`,
        body: { type: 'text', content: 'batch-body' }
      })

      const result = await service.executeBatch({
        collectionId: collection.id,
        timeoutMs: 5000
      })
      const state = await service.getState()

      expect(result.summary).toMatchObject({
        total: 2,
        succeeded: 2,
        failed: 0
      })
      expect(result.results.map((item) => item.resolvedRequest.url)).toEqual([
        `${echoServer.baseUrl}/batch/one`,
        `${echoServer.baseUrl}/batch/two`
      ])
      expect(state.history).toHaveLength(2)
    } finally {
      await echoServer.close()
    }
  })
})
