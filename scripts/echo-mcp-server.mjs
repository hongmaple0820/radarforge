#!/usr/bin/env node
/**
 * echo MCP 测试服务器（stdio / JSON-RPC 2.0）
 *
 * 用途：验证平台 MCP 客户端链路（initialize 握手 → tools/list → tools/call）。
 * 提供两个工具：
 *  - echo(text)      原样返回文本（附服务器时间戳）
 *  - time-now()      返回当前时间
 *
 * 它同时是「如何写一个最小 MCP 服务器」的参考样板。
 */

import { createInterface } from 'readline'

const SERVER_INFO = { name: 'echo', version: '1.0.0' }

const TOOLS = [
  {
    name: 'echo',
    description: '回显输入文本，用于验证 MCP 工具调用链路',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: '要回显的文本' } },
      required: ['text'],
    },
  },
  {
    name: 'time-now',
    description: '返回服务器当前时间（ISO 8601）',
    inputSchema: { type: 'object', properties: {} },
  },
]

function handleRequest(msg) {
  const { id, method, params } = msg
  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      }
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: TOOLS } }
    case 'tools/call': {
      const name = params?.name
      const args = params?.arguments ?? {}
      if (name === 'echo') {
        const text = typeof args.text === 'string' ? args.text : ''
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              { type: 'text', text: `[echo@${new Date().toISOString()}] ${text}` },
            ],
            isError: false,
          },
        }
      }
      if (name === 'time-now') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: new Date().toISOString() }],
            isError: false,
          },
        }
      }
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `未知工具: ${name}` }],
          isError: true,
        },
      }
    }
    default:
      if (id !== undefined) {
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法: ${method}` } }
      }
      return null // notification → 不回
  }
}

const rl = createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  let msg
  try {
    msg = JSON.parse(trimmed)
  } catch {
    return
  }
  const resp = handleRequest(msg)
  if (resp) process.stdout.write(JSON.stringify(resp) + '\n')
})
rl.on('close', () => process.exit(0))
