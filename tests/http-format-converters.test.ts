import { describe, expect, it } from 'vitest'
import type { HttpRequestRecord } from '@shared/ipc-contract'
import {
  exportCollectionAsPostman,
  exportRequestAsCurl,
  exportRequestAsHttpie,
  parseCurlCommand,
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
})
