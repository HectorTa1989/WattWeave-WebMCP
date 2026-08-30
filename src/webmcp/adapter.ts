/**
 * WebMCP adapter.
 *
 * Bridges WattWeave's dynamic tool registry to the browser's Web Model
 * Context API when present:
 *   • `navigator.modelContext.registerTool(def)` (imperative, per-tool) or
 *   • `navigator.modelContext.provideContext({ tools })` (declarative, full set)
 * and always mirrors the registry into an in-page store that the developer
 * inspector renders — so the demo works with or without an attached agent.
 *
 * Every execution (agent or inspector) funnels through `invokeTool`, which
 * validates registration, records an execution log entry, and returns
 * MCP-style content blocks.
 */

export interface McpContent {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

export interface ToolAnnotations {
  title?: string
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  /** WattWeave extras, shown in the inspector. */
  cancellable?: boolean
  uiStateOnly?: boolean
  lifecycle: string
}

export interface WebMcpToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: ToolAnnotations
  execute: (args: unknown, ctx: { signal?: AbortSignal }) => Promise<McpContent>
}

export interface ToolLogEntry {
  id: number
  at: string
  name: string
  actor: 'agent' | 'inspector'
  argsPreview: string
  resultPreview: string
  ok: boolean
  durationMs: number
}

interface NavigatorModelContext {
  registerTool?: (tool: {
    name: string
    description: string
    inputSchema: Record<string, unknown>
    annotations?: Record<string, unknown>
    execute: (args: unknown) => Promise<McpContent>
  }) => { unregister?: () => void } | (() => void) | void
  provideContext?: (ctx: { tools: unknown[] }) => void
}

const registry = new Map<string, WebMcpToolDef>()
const nativeHandles = new Map<string, () => void>()
let revision = 0
let logSeq = 0
const log: ToolLogEntry[] = []
const listeners = new Set<() => void>()

let snapshotCache: { revision: number; tools: WebMcpToolDef[]; log: ToolLogEntry[] } = {
  revision: 0,
  tools: [],
  log: [],
}

function notify() {
  revision += 1
  snapshotCache = { revision, tools: [...registry.values()], log: [...log] }
  for (const l of listeners) l()
}

function nativeContext(): NavigatorModelContext | null {
  if (typeof navigator === 'undefined') return null
  const nav = navigator as Navigator & { modelContext?: NavigatorModelContext }
  return nav.modelContext ?? null
}

function nativeRegister(def: WebMcpToolDef) {
  const ctx = nativeContext()
  if (!ctx) return
  if (typeof ctx.registerTool === 'function') {
    try {
      const handle = ctx.registerTool({
        name: def.name,
        description: def.description,
        inputSchema: def.inputSchema,
        annotations: { ...def.annotations },
        execute: (args) => invokeTool(def.name, args, { actor: 'agent' }),
      })
      if (typeof handle === 'function') nativeHandles.set(def.name, handle)
      else if (handle && typeof handle.unregister === 'function')
        nativeHandles.set(def.name, () => handle.unregister?.())
    } catch (e) {
      console.warn(`[webmcp] registerTool(${def.name}) failed`, e)
    }
  }
}

function nativeUnregister(name: string) {
  const un = nativeHandles.get(name)
  if (un) {
    try {
      un()
    } catch {
      /* ignore */
    }
    nativeHandles.delete(name)
  }
}

function nativeProvideAll() {
  const ctx = nativeContext()
  if (!ctx || typeof ctx.provideContext !== 'function' || typeof ctx.registerTool === 'function')
    return
  try {
    ctx.provideContext({
      tools: [...registry.values()].map((def) => ({
        name: def.name,
        description: def.description,
        inputSchema: def.inputSchema,
        annotations: { ...def.annotations },
        execute: (args: unknown) => invokeTool(def.name, args, { actor: 'agent' }),
      })),
    })
  } catch (e) {
    console.warn('[webmcp] provideContext failed', e)
  }
}

export function registerTool(def: WebMcpToolDef): void {
  registry.set(def.name, def)
  nativeRegister(def)
  nativeProvideAll()
  notify()
}

export function unregisterTool(name: string): void {
  if (!registry.delete(name)) return
  nativeUnregister(name)
  nativeProvideAll()
  notify()
}

export function registeredToolNames(): string[] {
  return [...registry.keys()]
}

export function hasTool(name: string): boolean {
  return registry.has(name)
}

const preview = (v: unknown, max = 220): string => {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  if (!s) return ''
  return s.length > max ? `${s.slice(0, max)}…` : s
}

export async function invokeTool(
  name: string,
  args: unknown,
  opts: { actor: 'agent' | 'inspector'; signal?: AbortSignal },
): Promise<McpContent> {
  const started = typeof performance !== 'undefined' ? performance.now() : 0
  const def = registry.get(name)
  const finish = (result: McpContent): McpContent => {
    logSeq += 1
    log.push({
      id: logSeq,
      at: new Date().toLocaleTimeString('en-US', { hour12: false }),
      name,
      actor: opts.actor,
      argsPreview: preview(args ?? {}),
      resultPreview: preview(result.content[0]?.text ?? ''),
      ok: !result.isError,
      durationMs: Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - started),
    })
    if (log.length > 120) log.splice(0, log.length - 120)
    notify()
    return result
  }
  if (!def) {
    return finish(errorContent('TOOL_NOT_AVAILABLE', `Tool "${name}" is not registered in the current UI state.`))
  }
  try {
    return finish(await def.execute(args ?? {}, { signal: opts.signal }))
  } catch (e) {
    return finish(errorContent('TOOL_CRASH', e instanceof Error ? e.message : String(e)))
  }
}

export function jsonContent(payload: unknown): McpContent {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 1) }] }
}

export function errorContent(code: string, message: string, details?: unknown): McpContent {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: { code, message, details } }, null, 1) }],
    isError: true,
  }
}

// ---- inspector subscription (useSyncExternalStore-compatible) ----

export function subscribeTools(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getToolsSnapshot(): { revision: number; tools: WebMcpToolDef[]; log: ToolLogEntry[] } {
  return snapshotCache
}

export function isNativeWebMcpAvailable(): boolean {
  const ctx = nativeContext()
  return Boolean(ctx && (ctx.registerTool || ctx.provideContext))
}
