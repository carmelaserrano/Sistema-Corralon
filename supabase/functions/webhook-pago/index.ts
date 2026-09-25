import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, x-request-id',
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
})
const mensaje = (error: unknown) => error instanceof Error ? error.message : 'Error inesperado'

/* ── HMAC helpers ── */

function bytesAHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time string comparison to prevent timing attacks. */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Validates the x-signature header from modern Mercado Pago webhooks.
 * Supports multiple v1 entries (picks the first match).
 * Format: ts=<timestamp>,v1=<hash>[,v1=<hash2>]
 */
async function firmaValida(
  request: Request,
  dataId: string,
  secreto: string,
): Promise<boolean> {
  const firma = request.headers.get('x-signature') || ''
  const requestId = request.headers.get('x-request-id') || ''
  if (!firma || !requestId) return false

  // Parse all parts from the header
  const partes: Record<string, string[]> = {}
  for (const segmento of firma.split(',')) {
    const idx = segmento.indexOf('=')
    if (idx < 1) continue
    const k = segmento.slice(0, idx).trim()
    const v = segmento.slice(idx + 1).trim()
    if (!partes[k]) partes[k] = []
    partes[k].push(v)
  }

  const ts = partes['ts']?.[0]
  const hashes = partes['v1'] || []
  if (!ts || hashes.length === 0) return false

  const manifiesto = `id:${dataId};request-id:${requestId};ts:${ts};`
  const clave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const calculada = bytesAHex(
    await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(manifiesto)),
  )

  // Match against any v1 hash provided
  return hashes.some((h) => iguales(calculada, h.toLowerCase()))
}

/* ── Notification type/ID normalization ── */

interface NotificacionNormalizada {
  tipo: 'payment' | null
  paymentId: string | null
  esLegacy: boolean
}

/**
 * Normalizes both modern webhook and legacy IPN notification formats.
 * Modern: type=payment, data.id in query or body.data.id
 * Legacy/IPN: topic=payment, id in query or body.id
 */
function normalizarNotificacion(
  url: URL,
  body: Record<string, unknown>,
): NotificacionNormalizada {
  // Modern format: type=payment, data.id
  const tipoModerno = (body.type as string) || url.searchParams.get('type')
  const dataIdQuery = url.searchParams.get('data.id')
  const dataIdBody = (body.data as Record<string, unknown>)?.id?.toString()

  // Legacy/IPN format: topic=payment, id or payment_id
  const topicQuery = url.searchParams.get('topic')
  const topicBody = body.topic as string | undefined
  const idQuery = url.searchParams.get('id')
  const paymentIdQuery = url.searchParams.get('payment_id')
  const idBody = body.id?.toString()

  // Determine type
  let tipo: 'payment' | null = null
  if (tipoModerno === 'payment' || topicQuery === 'payment' || topicBody === 'payment') {
    tipo = 'payment'
  }

  // Determine payment ID (modern takes priority)
  const paymentId = dataIdQuery || dataIdBody || paymentIdQuery || idQuery || idBody || null

  // Determine if legacy format
  const esLegacy = !!(topicQuery === 'payment' || topicBody === 'payment') && !tipoModerno

  return { tipo, paymentId, esLegacy }
}

/** Validates a UUID v4 format string. */
function esUUID(valor: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)
}

/* ── Payment validation and processing ── */

async function consultarYValidarPago(
  paymentId: string,
  accessToken: string,
  supabase: ReturnType<typeof createClient>,
): Promise<{ pedidoActualizado: unknown } | { ignorado: true, razon: string }> {
  // Query the payment from Mercado Pago API (authoritative source)
  const mpRes = await fetch(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!mpRes.ok) {
    const mpErr = await mpRes.json().catch(() => ({}))
    if (mpRes.status === 404) return { ignorado: true, razon: 'pago no encontrado en MP' }
    throw new Error(mpErr.message || `MP respondió ${mpRes.status}`)
  }

  const pago = await mpRes.json()

  // Validate external_reference is a UUID
  const extRef = pago.external_reference
  if (!extRef || !esUUID(extRef)) {
    return { ignorado: true, razon: 'external_reference ausente o no UUID' }
  }

  // Validate currency
  if (pago.currency_id !== 'ARS') {
    return { ignorado: true, razon: `moneda inesperada: ${pago.currency_id}` }
  }

  // Only process known statuses
  const estadosAceptados = ['approved', 'rejected', 'cancelled', 'pending', 'in_process']
  if (!estadosAceptados.includes(pago.status)) {
    return { ignorado: true, razon: `estado no procesable: ${pago.status}` }
  }

  // Verify the order exists and the amount matches
  const { data: pedido, error: pedErr } = await supabase
    .from('pedidos_web')
    .select('id, total, preferencia_pago_id')
    .eq('id', extRef)
    .maybeSingle()

  if (pedErr) throw pedErr
  if (!pedido) return { ignorado: true, razon: 'pedido no encontrado' }

  // Validate amount matches exactly
  if (Number(pago.transaction_amount) !== Number(pedido.total)) {
    console.warn(`webhook-pago: importe no coincide. MP=${pago.transaction_amount}, pedido=${pedido.total}`)
    return { ignorado: true, razon: 'importe no coincide' }
  }

  // If MP returns a preference ID, verify it matches
  if (pago.preference_id && pedido.preferencia_pago_id && pago.preference_id !== pedido.preferencia_pago_id) {
    console.warn(`webhook-pago: preferencia no coincide. MP=${pago.preference_id}, pedido=${pedido.preferencia_pago_id}`)
    return { ignorado: true, razon: 'preferencia no coincide' }
  }

  // Execute idempotent RPC
  const { data, error } = await supabase.rpc('confirmar_pago_pedido', {
    p_pedido: extRef,
    p_referencia: pago.id.toString(),
    p_estado: pago.status,
    p_motivo: pago.status_detail || null,
  })
  if (error) throw error

  return { pedidoActualizado: data }
}

/* ── Reconciliation from "Actualizar estado" ── */

async function reconciliar(
  pedidoId: string,
  request: Request,
  supabaseUrl: string,
  anonKey: string,
  serviceKey: string,
  accessToken: string,
): Promise<Response> {
  // Require user JWT
  const authorization = request.headers.get('Authorization')
  if (!authorization) return json({ error: 'Necesitás iniciar sesión' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  })

  // Verify the order belongs to this user (RLS enforced)
  const { data: pedido, error: pedErr } = await userClient
    .from('pedidos_web')
    .select('id, total, estado, preferencia_pago_id')
    .eq('id', pedidoId)
    .maybeSingle()

  if (pedErr) throw pedErr
  if (!pedido) return json({ error: 'El pedido no existe o no te pertenece' }, 404)

  // If already paid or cancelled, just return current state
  if (pedido.estado === 'Pagado' || pedido.estado === 'Cancelado') {
    return json({ pedido })
  }

  // Search for payments by external_reference in Mercado Pago
  const searchRes = await fetch(
    `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(pedidoId)}&sort=date_created&criteria=desc&limit=5`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!searchRes.ok) {
    throw new Error('No pudimos consultar los pagos en Mercado Pago')
  }

  const searchData = await searchRes.json()
  const resultados = searchData.results || []

  if (resultados.length === 0) {
    return json({ pedido, mensaje: 'Todavía no hay pagos registrados para este pedido en Mercado Pago' })
  }

  // Pick the most relevant payment: prefer approved, then most recent
  const pagoAprobado = resultados.find((p: Record<string, unknown>) => p.status === 'approved')
  const pagoRelevante = pagoAprobado || resultados[0]

  // Validate currency
  if (pagoRelevante.currency_id !== 'ARS') {
    return json({ error: 'La moneda del pago no coincide' }, 422)
  }

  // Validate amount
  if (Number(pagoRelevante.transaction_amount) !== Number(pedido.total)) {
    return json({ error: 'El importe del pago no coincide con el pedido' }, 422)
  }

  // Validate preference if available
  if (pagoRelevante.preference_id && pedido.preferencia_pago_id && pagoRelevante.preference_id !== pedido.preferencia_pago_id) {
    return json({ error: 'La preferencia del pago no coincide' }, 422)
  }

  // Process with service role
  const admin = createClient(supabaseUrl, serviceKey)
  const { data, error } = await admin.rpc('confirmar_pago_pedido', {
    p_pedido: pedidoId,
    p_referencia: pagoRelevante.id.toString(),
    p_estado: pagoRelevante.status,
    p_motivo: pagoRelevante.status_detail || null,
  })
  if (error) throw error

  return json({ pedido: data })
}

/* ── Main handler ── */

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!['POST', 'GET'].includes(request.method)) return json({ error: 'Método no permitido' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}

    /* ── Route: Simulated payment (QA only) ── */
    if (body.simulated === true) {
      if (Deno.env.get('PAGO_SIMULADO') !== 'true') return json({ error: 'La pasarela simulada está deshabilitada' }, 403)
      if (!['approved', 'rejected'].includes(body.status) || !body.pedido_id) return json({ error: 'Simulación inválida' }, 400)
      const authorization = request.headers.get('Authorization')
      if (!authorization) return json({ error: 'Necesitás iniciar sesión' }, 401)
      const cliente = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
      const { data: pedido } = await cliente.from('pedidos_web').select('id').eq('id', body.pedido_id).maybeSingle()
      if (!pedido) return json({ error: 'El pedido no existe o no te pertenece' }, 404)
      const admin = createClient(supabaseUrl, serviceKey)
      const { data, error } = await admin.rpc('confirmar_pago_pedido', {
        p_pedido: pedido.id,
        p_referencia: `SIM-${crypto.randomUUID()}`,
        p_estado: body.status,
        p_motivo: body.status === 'rejected' ? 'Pago rechazado por QA' : null,
      })
      if (error) throw error
      return json({ pedido: data })
    }

    /* ── Route: Reconciliation from frontend ── */
    if (body.action === 'reconcile') {
      if (!body.pedido_id || !esUUID(body.pedido_id)) {
        return json({ error: 'Falta el pedido a reconciliar' }, 400)
      }
      const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')
      if (!accessToken) throw new Error('Falta MERCADO_PAGO_ACCESS_TOKEN')
      return await reconciliar(body.pedido_id, request, supabaseUrl, anonKey, serviceKey, accessToken)
    }

    /* ── Route: Webhook notification from Mercado Pago ── */
    const url = new URL(request.url)
    const notif = normalizarNotificacion(url, body)

    // If not a payment notification or no payment ID, acknowledge and ignore
    if (notif.tipo !== 'payment' || !notif.paymentId) {
      return json({ received: true, ignored: true })
    }

    const webhookSecret = Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET')
    const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')
    if (!webhookSecret || !accessToken) throw new Error('Faltan los secretos de Mercado Pago')

    // Try modern signature validation
    const firmaOk = await firmaValida(request, notif.paymentId, webhookSecret)

    if (!firmaOk && !notif.esLegacy) {
      // Modern format but invalid signature → reject
      console.warn('webhook-pago: firma inválida en notificación moderna')
      return json({ error: 'Firma inválida' }, 401)
    }

    if (!firmaOk && notif.esLegacy) {
      // Legacy/IPN: no signature expected. We'll validate via the MP API instead.
      console.info('webhook-pago: notificación legacy/IPN, validando via API')
    }

    // Always query Mercado Pago API (authoritative source) and validate
    const admin = createClient(supabaseUrl, serviceKey)
    const resultado = await consultarYValidarPago(notif.paymentId, accessToken, admin)

    if ('ignorado' in resultado) {
      console.info(`webhook-pago: ignorado - ${resultado.razon}`)
      return json({ received: true, ignored: true, razon: resultado.razon })
    }

    return json({ received: true, pedido: resultado.pedidoActualizado })
  } catch (error) {
    console.error('webhook-pago error:', mensaje(error))
    return json({ error: mensaje(error) }, 500)
  }
})
