/**
 * MCP（Model Context Protocol）最小客户端
 *
 * 协议：JSON-RPC 2.0 over stdio（每行一个 JSON 消息）
 * 实现：initialize 握手 → tools/list 枚举 → tools/call 调用
 *
 * 价值（学 dsh 的可扩展工具层）：任何 MCP 服务器的工具
 * 都能挂进平台 tool-registry，与内置工具、Skills 并列成为 Agent 可用能力。
 */

import { spawn, type ChildProcess } from 'child_process'

export interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  description?: string
}

export interface McpToolDef {
  name: string
  description?: string
  inputSchema?: unknown
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const PROTOCOL_VERSION = '2024-11-05'
const CLIENT_INFO = { name: 'radar-workbench', version: '1.0.0' }

export class McpClient {
  private proc: ChildProcess | null = null
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private buffer = ''
  private stderrTail: string[] = []

  constructor(
    public readonly serverName: string,
    private readonly cfg: McpServerConfig
  ) {}

  /** 启动子进程并完成 initialize 握手 */
  async connect(timeoutMs = 10000): Promise<{ serverInfo: { name: string; version: string } }> {
    if (this.proc) return { serverInfo: { name: this.serverName, version: 'unknown' } }

    this.proc = spawn(this.cfg.command, this.cfg.args ?? [], {
      env: { ...process.env, ...this.cfg.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const child = this.proc
    if (!child.stdout || !child.stdin) throw new Error('无法建立 stdio 管道')

    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', (chunk: string) => this.onStdout(chunk))
    child.stderr?.setEncoding('utf-8')
    child.stderr?.on('data', (chunk: string) => {
      this.stderrTail.push(chunk)
      if (this.stderrTail.length > 20) this.stderrTail.shift()
    })
    child.on('exit', (code) => {
      const err = new Error(
        `MCP 服务器进程退出（code=${code}）${this.stderrTail.join('').slice(-300)}`
      )
      for (const p of this.pending.values()) {
        clearTimeout(p.timer)
        p.reject(err)
      }
      this.pending.clear()
      this.proc = null
    })

    const result = (await this.request(
      'initialize',
      { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
      timeoutMs
    )) as { serverInfo?: { name?: string; version?: string } }

    this.notify('notifications/initialized', {})

    return {
      serverInfo: {
        name: result?.serverInfo?.name ?? this.serverName,
        version: result?.serverInfo?.version ?? 'unknown',
      },
    }
  }

  /** 枚举服务器提供的工具 */
  async listTools(timeoutMs = 10000): Promise<McpToolDef[]> {
    const result = (await this.request('tools/list', {}, timeoutMs)) as { tools?: McpToolDef[] }
    return result?.tools ?? []
  }

  /** 调用一个工具 */
  async callTool(
    name: string,
    args: Record<string, unknown>,
    timeoutMs = 30000
  ): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args }, timeoutMs)
  }

  async close(): Promise<void> {
    const proc = this.proc
    if (!proc) return
    this.proc = null
    proc.stdin?.end()
    proc.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      if (proc.exitCode !== null || proc.killed) return resolve()
      const t = setTimeout(() => {
        proc.kill('SIGKILL')
        resolve()
      }, 2000)
      proc.on('exit', () => {
        clearTimeout(t)
        resolve()
      })
    })
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Error('客户端已关闭'))
    }
    this.pending.clear()
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk
    let idx: number
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      if (!line) continue
      try {
        const msg = JSON.parse(line) as { id?: number; result?: unknown; error?: { message?: string } }
        if (typeof msg.id === 'number') {
          const p = this.pending.get(msg.id)
          if (p) {
            this.pending.delete(msg.id)
            clearTimeout(p.timer)
            if (msg.error) p.reject(new Error(msg.error.message || 'MCP 调用返回错误'))
            else p.resolve(msg.result)
          }
        }
        // 无 id 的消息是 notification，当前无需处理
      } catch {
        // 非 JSON 行（日志等）忽略
      }
    }
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const proc = this.proc
    if (!proc?.stdin?.writable) return Promise.reject(new Error('MCP 未连接'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP 请求超时（${timeoutMs}ms）: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params })
      proc.stdin!.write(payload + '\n', (err) => {
        if (err) {
          this.pending.delete(id)
          clearTimeout(timer)
          reject(err)
        }
      })
    })
  }

  private notify(method: string, params: unknown): void {
    const proc = this.proc
    if (!proc?.stdin?.writable) return
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
  }
}

/** 一次性便捷封装：连接 → 枚举工具 → 关闭 */
export async function probeServer(
  name: string,
  cfg: McpServerConfig
): Promise<{ tools: McpToolDef[]; error?: string }> {
  const client = new McpClient(name, cfg)
  try {
    await client.connect()
    const tools = await client.listTools()
    return { tools }
  } catch (e) {
    return { tools: [], error: (e as Error)?.message || '连接失败' }
  } finally {
    await client.close()
  }
}
