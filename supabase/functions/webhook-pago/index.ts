import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, x-request-id',
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
})
const mensaje = (error: unknown) => error instanceof Error ? error.message : 'Error inesperado'

async function procesarPago(rpc: Function, datos: { pedidoId: string, referencia: string | number, estado: string, motivo?: string | null }) {
  const { data, error } = await rpc('confirmar_pago_pedido', {
    p_pedido: datos.pedidoId,
    p_referencia: String(datos.referencia),
    p_estado: datos.estado,
    p_motivo: datos.motivo ?? null,
  })
  if (error) throw error
  return data
}

function bytesAHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function iguales(a: string, b: string) {
  if (a.length !== b.length) return false
  let diferencia = 0
  for (let i = 0; i < a.length; i += 1) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diferencia === 0
}

async function firmaValida(request: Request, paymentId: string, secreto: string) {
  const firma = request.headers.get('x-signature') || ''
  const requestId = request.headers.get('x-request-id') || ''
  const partes = Object.fromEntries(firma.split(',').map((parte) => parte.trim().split('=')))
  if (!partes.ts || !partes.v1 || !requestId) return false
  const manifiesto = `id:${paymentId.toLowerCase()};request-id:${requestId};ts:${partes.ts};`
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const calculada = bytesAHex(await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(manifiesto)))
  return iguales(calculada, partes.v1.toLowerCase())
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!['POST', 'GET'].includes(request.method)) return json({ error: 'Método no permitido' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}

    if (body.simulated === true) {
      if (Deno.env.get('PAGO_SIMULADO') !== 'true') return json({ error: 'La pasarela simulada está deshabilitada' }, 403)
      if (!['approved', 'rejected'].includes(body.status) || !body.pedido_id) return json({ error: 'Simulación inválida' }, 400)
      const authorization = request.headers.get('Authorization')
      if (!authorization) return json({ error: 'Necesitás iniciar sesión' }, 401)
      const cliente = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
      const { data: pedido } = await cliente.from('pedidos_web').select('id').eq('id', body.pedido_id).maybeSingle()
      if (!pedido) return json({ error: 'El pedido no existe o no te pertenece' }, 404)
      const actualizado = await procesarPago(admin.rpc.bind(admin), {
        pedidoId: pedido.id,
        referencia: `SIM-${crypto.randomUUID()}`,
        estado: body.status,
        motivo: body.status === 'rejected' ? 'Pago rechazado por QA' : null,
      })
      return json({ pedido: actualizado })
    }

    const url = new URL(request.url)
    const paymentId = url.searchParams.get('data.id') || body?.data?.id?.toString()
    if (!paymentId || (body.type && body.type !== 'payment')) return json({ received: true, ignored: true })
    const webhookSecret = Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET')
    const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')
    if (!webhookSecret || !accessToken) throw new Error('Faltan los secretos de Mercado Pago')
    if (!await firmaValida(request, paymentId, webhookSecret)) return json({ error: 'Firma inválida' }, 401)

    const pagoResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const pago = await pagoResponse.json()
    if (!pagoResponse.ok) throw new Error(pago.message || 'No pudimos verificar el pago')
    if (!pago.external_reference) return json({ received: true, ignored: true })

    const estadosAceptados = ['approved', 'rejected', 'cancelled', 'pending', 'in_process']
    if (!estadosAceptados.includes(pago.status)) {
      return json({ received: true, ignored: true, status: pago.status })
    }
    const actualizado = await procesarPago(admin.rpc.bind(admin), {
      pedidoId: pago.external_reference,
      referencia: pago.id,
      estado: pago.status,
      motivo: pago.status_detail || null,
    })
    return json({ received: true, pedido: actualizado })
  } catch (error) {
    console.error(error)
    return json({ error: mensaje(error) }, 500)
  }
})
