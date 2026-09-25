import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
})
const mensaje = (error: unknown) => error instanceof Error ? error.message : 'Error inesperado'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')
    const appUrl = Deno.env.get('APP_URL')?.replace(/\/$/, '')
    const authorization = request.headers.get('Authorization')
    if (!authorization) return json({ error: 'Necesitás iniciar sesión' }, 401)
    if (!accessToken) throw new Error('Falta configurar MERCADO_PAGO_ACCESS_TOKEN')
    if (!appUrl || !appUrl.startsWith('https://')) throw new Error('APP_URL debe ser una URL pública HTTPS')

    const { pedido_id: pedidoId } = await request.json()
    if (!pedidoId) return json({ error: 'Falta el pedido' }, 400)

    const cliente = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
    const admin = createClient(supabaseUrl, serviceKey)
    const { data: pedido, error: errorPedido } = await cliente
      .from('pedidos_web')
      .select('id, numero, estado, total, vence_at')
      .eq('id', pedidoId)
      .maybeSingle()
    if (errorPedido) throw errorPedido
    if (!pedido) return json({ error: 'El pedido no existe o no te pertenece' }, 404)
    if (pedido.estado !== 'Pendiente de pago' || new Date(pedido.vence_at).getTime() <= Date.now()) {
      return json({ error: 'El pedido ya no admite pagos' }, 409)
    }

    const { data: lineas, error: errorLineas } = await admin
      .from('detalle_pedido_web')
      .select('producto_id, cantidad, precio_unitario, productos(nombre)')
      .eq('pedido_id', pedidoId)
    if (errorLineas) throw errorLineas
    if (!lineas?.length) throw new Error('El pedido no tiene productos')

    const venceAt = new Date(pedido.vence_at)
    if (Number.isNaN(venceAt.getTime()) || venceAt.getTime() <= Date.now()) {
      return json({ error: 'El pedido ya no admite pagos' }, 409)
    }

    const preferenceResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': pedido.id },
      body: JSON.stringify({
        items: lineas.map((linea) => ({
          id: linea.producto_id,
          title: linea.productos?.nombre || 'Producto',
          quantity: Number(linea.cantidad),
          unit_price: Number(linea.precio_unitario),
          currency_id: 'ARS',
        })),
        external_reference: pedido.id,
        notification_url: `${supabaseUrl}/functions/v1/webhook-pago`,
        back_urls: {
          success: `${appUrl}/tienda?pago=aprobado&pedido=${pedido.id}`,
          failure: `${appUrl}/tienda?pago=rechazado&pedido=${pedido.id}`,
          pending: `${appUrl}/tienda?pago=pendiente&pedido=${pedido.id}`,
        },
        auto_return: 'approved',
        // La preferencia deja de aceptar pagos cuando vence la reserva de stock.
        // Así Mercado Pago y cancelar_pedidos_web_vencidos comparten el mismo límite.
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: venceAt.toISOString(),
        statement_descriptor: 'CORRALON',
      }),
    })
    const preferencia = await preferenceResponse.json()
    if (!preferenceResponse.ok) throw new Error(preferencia.message || 'Mercado Pago rechazó la preferencia')

    const { error: errorRegistro } = await admin.rpc('registrar_preferencia_pago', {
      p_pedido: pedido.id,
      p_preferencia: preferencia.id,
    })
    if (errorRegistro) throw errorRegistro

    return json({
      preference_id: preferencia.id,
      init_point: preferencia.sandbox_init_point || preferencia.init_point,
    })
  } catch (error) {
    console.error(error)
    return json({ error: mensaje(error) }, 500)
  }
})
