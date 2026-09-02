import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

const host = process.env.CONTROL_GATEWAY_HOST ?? '127.0.0.1'
const port = Number(process.env.CONTROL_GATEWAY_PORT ?? 8787)
const allowedOrigin = process.env.CONTROL_GATEWAY_ORIGIN ?? 'http://localhost:5173'
const homeAssistantUrl = (process.env.HOME_ASSISTANT_URL ?? '').replace(/\/$/, '')
const homeAssistantToken = process.env.HOME_ASSISTANT_TOKEN ?? ''
const receipts = new Map()

const send = (response, status, body, origin = allowedOrigin) => {
  response.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, idempotency-key',
    vary: 'origin',
  })
  response.end(JSON.stringify(body))
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin ?? allowedOrigin
  if (origin !== allowedOrigin) return send(response, 403, { accepted: false, message: 'Origin not allowed.' })
  if (request.method === 'OPTIONS') return send(response, 204, {}, origin)
  if (request.method !== 'POST' || request.url !== '/control') {
    return send(response, 404, { accepted: false, message: 'POST /control only.' }, origin)
  }
  if (!homeAssistantUrl || !homeAssistantToken) {
    return send(response, 503, {
      accepted: false,
      message: 'Set HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN on the gateway server.',
    }, origin)
  }

  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 1_000_000) return send(response, 413, { accepted: false, message: 'Command too large.' }, origin)
    chunks.push(chunk)
  }

  let command
  try {
    command = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return send(response, 400, { accepted: false, message: 'Invalid JSON.' }, origin)
  }
  const key = request.headers['idempotency-key']
  if (!key || key !== command.idempotencyKey || !['apply', 'rollback'].includes(command.operation)) {
    return send(response, 400, { accepted: false, message: 'Invalid operation or idempotency key.' }, origin)
  }
  if (receipts.has(key)) return send(response, 200, receipts.get(key), origin)

  const upstream = await fetch(`${homeAssistantUrl}/api/events/wattweave_schedule`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${homeAssistantToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(command),
  }).catch((error) => ({ ok: false, status: 502, text: async () => String(error) }))
  if (!upstream.ok) {
    return send(response, 502, {
      accepted: false,
      message: `Home Assistant rejected the event (${upstream.status}): ${(await upstream.text()).slice(0, 240)}`,
    }, origin)
  }

  const receipt = {
    accepted: true,
    operationId: `ha-${randomUUID()}`,
    message: `Home Assistant accepted the WattWeave ${command.operation} event.`,
  }
  receipts.set(key, receipt)
  return send(response, 200, receipt, origin)
})

server.listen(port, host, () => {
  console.log(`WattWeave Home Assistant gateway listening at http://${host}:${port}/control`)
})
