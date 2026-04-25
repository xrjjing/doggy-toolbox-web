import { describe, expect, it } from 'vitest'
import type { HttpRequestRecord } from '@shared/ipc-contract'
import {
  exportRequestAsCodeSnippet,
  exportCollectionAsApifox,
  exportCollectionAsOpenApi,
  exportCollectionAsPostman,
  exportRequestAsCurl,
  exportRequestAsHttpie,
  parseApifoxCollection,
  parseCurlCommand,
  parseOpenApiDocument,
  parsePostmanCollection
} from '@renderer/features/http/http-format-converters'

function createRequest(): HttpRequestRecord {
  return {
    id: 'req_1',
    collectionId: 'col_1',
    name: '创建用户',
    method: 'POST',
    url: 'https://api.example.com/users',
    description: '',
    headers: [
      {
        id: 'header_1',
        key: 'Content-Type',
        value: 'application/json',
        enabled: true,
        description: ''
      },
      {
        id: 'header_2',
        key: 'X-Debug',
        value: 'off',
        enabled: false,
        description: ''
      }
    ],
    params: [],
    body: {
      type: 'json',
      content: '{"name":"doggy"}'
    },
    auth: {
      type: 'bearer',
      token: '{{token}}',
      username: '',
      password: ''
    },
    tags: [],
    order: 0,
    createdAt: '',
    updatedAt: ''
  }
}

describe('http format converters', () => {
  it('parses common curl command into request save input', () => {
    const input = parseCurlCommand(
      "curl -X POST 'https://api.example.com/users' -H 'Content-Type: application/json' -H 'X-Token: {{token}}' --data-raw '{\"name\":\"doggy\"}'",
      'col_1'
    )

    expect(input).toMatchObject({
      collectionId: 'col_1',
      method: 'POST',
      url: 'https://api.example.com/users',
      body: {
        type: 'json',
        content: '{"name":"doggy"}'
      },
      tags: ['curl-import']
    })
    expect(input.headers).toEqual([
      {
        key: 'Content-Type',
        value: 'application/json',
        enabled: true,
        description: ''
      },
      {
        key: 'X-Token',
        value: '{{token}}',
        enabled: true,
        description: ''
      }
    ])
  })

  it('exports request as curl command', () => {
    const command = exportRequestAsCurl(createRequest())

    expect(command).toContain("curl -X POST 'https://api.example.com/users'")
    expect(command).toContain("-H 'Content-Type: application/json'")
    expect(command).toContain("-H 'Authorization: Bearer {{token}}'")
    expect(command).toContain('--data-raw \'{"name":"doggy"}\'')
    expect(command).not.toContain('X-Debug')
  })

  it('exports request as HTTPie command', () => {
    const command = exportRequestAsHttpie(createRequest())

    expect(command).toContain("http POST 'https://api.example.com/users'")
    expect(command).toContain("'Content-Type:application/json'")
    expect(command).toContain("'Authorization:Bearer {{token}}'")
    expect(command).toContain('\'{"name":"doggy"}\'')
  })

  it('exports request as multi language snippets for curl tool migration', () => {
    const fetchSnippet = exportRequestAsCodeSnippet(createRequest(), 'fetch')
    const axiosSnippet = exportRequestAsCodeSnippet(createRequest(), 'axios')
    const pythonSnippet = exportRequestAsCodeSnippet(createRequest(), 'python')
    const nodeSnippet = exportRequestAsCodeSnippet(createRequest(), 'node')
    const phpSnippet = exportRequestAsCodeSnippet(createRequest(), 'php')
    const goSnippet = exportRequestAsCodeSnippet(createRequest(), 'go')

    expect(fetchSnippet.label).toBe('Fetch')
    expect(fetchSnippet.code).toContain('await fetch(')
    expect(fetchSnippet.code).toContain('"Authorization": "Bearer {{token}}"')

    expect(axiosSnippet.code).toContain("import axios from 'axios'")
    expect(axiosSnippet.code).toContain('data: {')

    expect(pythonSnippet.code).toContain('import requests')
    expect(pythonSnippet.code).toContain('requests.request("POST"')

    expect(nodeSnippet.code).toContain("import https from 'node:https'")
    expect(nodeSnippet.code).toContain('headers: {')
    expect(nodeSnippet.code).toContain('req.write(body)')

    expect(phpSnippet.code).toContain('curl_init(')
    expect(phpSnippet.code).toContain('CURLOPT_POSTFIELDS')

    expect(goSnippet.code).toContain('http.NewRequest(')
    expect(goSnippet.code).toContain('req.Header.Set("Authorization", "Bearer {{token}}")')
  })

  it('parses Postman collection into request inputs', () => {
    const requests = parsePostmanCollection(
      JSON.stringify({
        info: {
          name: '用户接口',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
        },
        item: [
          {
            name: '创建用户',
            request: {
              method: 'POST',
              url: 'https://api.example.com/users',
              header: [{ key: 'Content-Type', value: 'application/json' }],
              body: {
                mode: 'raw',
                raw: '{"name":"doggy"}'
              },
              auth: {
                type: 'bearer',
                bearer: [{ key: 'token', value: '{{token}}' }]
              }
            }
          }
        ]
      }),
      'col_1'
    )

    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      collectionId: 'col_1',
      name: '创建用户',
      method: 'POST',
      url: 'https://api.example.com/users',
      body: {
        type: 'json',
        content: '{"name":"doggy"}'
      },
      auth: {
        type: 'bearer',
        token: '{{token}}'
      },
      tags: ['postman-import']
    })
  })

  it('exports collection as Postman collection JSON', () => {
    const json = exportCollectionAsPostman(
      {
        id: 'col_1',
        name: '用户接口',
        description: '',
        order: 0,
        createdAt: '',
        updatedAt: ''
      },
      [createRequest()]
    )
    const parsed = JSON.parse(json)

    expect(parsed.info).toMatchObject({
      name: '用户接口',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    })
    expect(parsed.item[0].request).toMatchObject({
      method: 'POST',
      url: 'https://api.example.com/users',
      auth: {
        type: 'bearer',
        bearer: [{ key: 'token', value: '{{token}}' }]
      }
    })
  })

  it('parses OpenAPI 3 document into request inputs', () => {
    const requests = parseOpenApiDocument(
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: '用户接口', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users/{id}': {
            get: {
              summary: '查询用户',
              description: '按 ID 查询用户',
              tags: ['用户'],
              parameters: [
                { name: 'id', in: 'path', example: 'u_1' },
                { name: 'includePosts', in: 'query', example: true },
                { name: 'X-Trace', in: 'header', example: 'trace-1' }
              ]
            },
            post: {
              summary: '创建用户',
              requestBody: {
                content: {
                  'application/json': {
                    example: { name: 'doggy' }
                  }
                }
              }
            }
          }
        }
      }),
      'col_1'
    )

    expect(requests).toHaveLength(2)
    expect(requests[0]).toMatchObject({
      collectionId: 'col_1',
      name: '查询用户',
      method: 'GET',
      url: 'https://api.example.com/users/{id}',
      tags: ['用户', 'openapi-import']
    })
    expect(requests[0].params).toEqual([
      {
        key: 'id',
        value: 'u_1',
        enabled: true,
        description: 'path'
      },
      {
        key: 'includePosts',
        value: 'true',
        enabled: true,
        description: 'query'
      }
    ])
    expect(requests[0].headers).toEqual([
      {
        key: 'X-Trace',
        value: 'trace-1',
        enabled: true,
        description: 'header'
      }
    ])
    expect(requests[1]).toMatchObject({
      method: 'POST',
      body: {
        type: 'json',
        content: '{\n  "name": "doggy"\n}'
      }
    })
  })

  it('exports collection as OpenAPI 3 document', () => {
    const parsed = JSON.parse(
      exportCollectionAsOpenApi(
        {
          id: 'col_1',
          name: '用户接口',
          description: '用户相关接口',
          order: 0,
          createdAt: '',
          updatedAt: ''
        },
        [createRequest()]
      )
    )

    expect(parsed.openapi).toBe('3.0.3')
    expect(parsed.info).toMatchObject({
      title: '用户接口',
      description: '用户相关接口'
    })
    expect(parsed.servers).toEqual([{ url: 'https://api.example.com' }])
    expect(parsed.paths['/users'].post).toMatchObject({
      summary: '创建用户',
      requestBody: {
        content: {
          'application/json': {
            example: { name: 'doggy' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    })
  })

  it('parses Apifox apiCollection into request inputs', () => {
    const requests = parseApifoxCollection(
      JSON.stringify({
        info: { name: '用户接口' },
        apiCollection: [
          {
            name: '用户模块',
            items: [
              {
                name: '创建用户',
                api: {
                  method: 'POST',
                  path: '/users',
                  description: '创建用户',
                  tags: ['用户'],
                  parameters: {
                    query: [{ name: 'debug', value: '1' }],
                    header: [{ name: 'X-Token', value: '{{token}}' }]
                  },
                  requestBody: {
                    type: 'application/json',
                    examples: [{ name: '默认示例', value: '{"name":"doggy"}' }]
                  }
                }
              }
            ]
          }
        ]
      }),
      'col_1'
    )

    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      collectionId: 'col_1',
      name: '创建用户',
      method: 'POST',
      url: '/users',
      description: '创建用户',
      headers: [
        {
          key: 'X-Token',
          value: '{{token}}',
          enabled: true,
          description: ''
        }
      ],
      params: [
        {
          key: 'debug',
          value: '1',
          enabled: true,
          description: ''
        }
      ],
      body: {
        type: 'json',
        content: '{"name":"doggy"}'
      },
      tags: ['用户', 'apifox-import']
    })
  })

  it('exports collection as Apifox compatible JSON', () => {
    const parsed = JSON.parse(
      exportCollectionAsApifox(
        {
          id: 'col_1',
          name: '用户接口',
          description: '',
          order: 0,
          createdAt: '',
          updatedAt: ''
        },
        [createRequest()]
      )
    )

    expect(parsed.info.name).toBe('用户接口')
    expect(parsed.apiCollection[0].items[0]).toMatchObject({
      name: '创建用户',
      api: {
        method: 'POST',
        path: 'https://api.example.com/users',
        requestBody: {
          type: 'application/json',
          examples: [{ name: '默认示例', value: '{"name":"doggy"}' }]
        }
      }
    })
  })
})
