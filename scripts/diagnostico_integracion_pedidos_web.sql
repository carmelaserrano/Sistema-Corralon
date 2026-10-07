-- Diagnóstico de integración: depósitos, stock, movimientos y pedidos web.
-- Solo lectura: no modifica estructura ni datos.
-- Ejecutar completo en el SQL Editor de Supabase. Devuelve una fila por
-- control: primero los que tienen hallazgos (errores, avisos, info) y al final
-- los que dan 0. Para compartirlo, exportar el resultado como CSV/JSON.
--
-- Columnas: control, severidad, cantidad, muestra. Severidades:
--   error  → dato inconsistente que rompe un flujo (cancelar, entregar, cobrar).
--   aviso  → dato sospechoso que conviene revisar a mano.
--   info   → contexto para interpretar el resto (no requiere acción).
-- La muestra trae hasta 20 filas por control.
--
-- La reserva esperada por producto y depósito es lo que las funciones van a
-- liberar o egresar más adelante (ver 0063_integridad_depositos_pedidos_web.sql):
--   ventas Pendiente/Facturada  → cantidad - cantidad_backorder
--   pedidos web del checkout    → cantidad, mientras no estén Entregado/Cancelado
begin transaction read only;

with
parametro_ecommerce as (
  select (pv.valor ->> 'deposito_id') as deposito_texto
  from public.parametros_ventas pv
  where pv.clave = 'deposito_ecommerce'
),
reservas as (
  select v.deposito_id, dv.producto_id, sum(dv.cantidad - dv.cantidad_backorder) as cantidad
  from public.ventas v
  join public.detalle_venta dv on dv.venta_id = v.id
  where v.estado in ('Pendiente', 'Facturada')
    and dv.cantidad - dv.cantidad_backorder > 0
  group by v.deposito_id, dv.producto_id
  union all
  select p.deposito_id, d.producto_id, sum(d.cantidad)
  from public.pedidos_web p
  join public.detalle_pedido_web d on d.pedido_id = p.id
  where p.checkout_id is not null
    and p.estado not in ('Entregado', 'Cancelado')
  group by p.deposito_id, d.producto_id
),
reservas_por_stock as (
  select deposito_id, producto_id, sum(cantidad) as esperado
  from reservas
  group by deposito_id, producto_id
),
saldo_movimientos as (
  select deposito_id, producto_id, sum(signo * cantidad) as saldo
  from (
    select m.deposito_destino_id as deposito_id, dm.producto_id, dm.cantidad, 1 as signo
    from public.movimientos_stock m
    join public.detalle_movimiento dm on dm.movimiento_id = m.id
    where m.estado_movimiento = 'confirmado' and m.deposito_destino_id is not null
    union all
    select m.deposito_origen_id, dm.producto_id, dm.cantidad, -1
    from public.movimientos_stock m
    join public.detalle_movimiento dm on dm.movimiento_id = m.id
    where m.estado_movimiento = 'confirmado' and m.deposito_origen_id is not null
  ) x
  group by deposito_id, producto_id
),
ultimo_historial as (
  select distinct on (h.pedido_id) h.pedido_id, h.estado_nuevo
  from public.historial_estado_pedido h
  order by h.pedido_id, h.created_at desc, h.id desc
),
controles as (
  -- ---------------------------------------------------------------- Depósitos
  select 'D1 depósito de e-commerce configurado y existente' as control, 'error' as severidad,
    (select jsonb_agg(x) from (
      select 'sin parámetro deposito_ecommerce' as problema
      where not exists (select 1 from parametro_ecommerce)
      union all
      select 'el parámetro apunta a un depósito inexistente: ' || coalesce(pe.deposito_texto, 'null')
      from parametro_ecommerce pe
      where pe.deposito_texto is null
         or pe.deposito_texto !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or not exists (select 1 from public.depositos d where d.id::text = pe.deposito_texto)
    ) x) as filas

  union all
  select 'D2 depósitos con stock físico por encima de su capacidad', 'aviso',
    (select jsonb_agg(x) from (
      select d.nombre, d.capacidad_maxima, sum(s.cantidad) as stock_total
      from public.depositos d
      join public.stock_x_deposito s on s.deposito_id = d.id
      group by d.id
      having sum(s.cantidad) > d.capacidad_maxima
    ) x)

  union all
  select 'D3 depósitos con nombre repetido (ignorando mayúsculas y espacios)', 'aviso',
    (select jsonb_agg(x) from (
      select lower(btrim(nombre)) as nombre_normalizado, jsonb_agg(nombre) as nombres
      from public.depositos
      group by lower(btrim(nombre))
      having count(*) > 1
    ) x)

  union all
  select 'D4 stock por depósito (resumen)', 'info',
    (select jsonb_agg(x) from (
      select d.nombre,
        (d.id::text = (select deposito_texto from parametro_ecommerce)) as es_ecommerce,
        count(s.id) as articulos, coalesce(sum(s.cantidad), 0) as fisico,
        coalesce(sum(s.comprometido), 0) as comprometido
      from public.depositos d
      left join public.stock_x_deposito s on s.deposito_id = d.id
      group by d.id
      order by d.nombre
    ) x)

  -- -------------------------------------------------------------------- Stock
  union all
  select 'S1 comprometido distinto de las reservas activas', 'error',
    (select jsonb_agg(x) from (
      select d.nombre as deposito, p.sku, s.cantidad, s.comprometido,
        coalesce(r.esperado, 0) as reservas_activas
      from public.stock_x_deposito s
      join public.depositos d on d.id = s.deposito_id
      join public.productos p on p.id = s.producto_id
      left join reservas_por_stock r
        on r.deposito_id = s.deposito_id and r.producto_id = s.producto_id
      where s.comprometido <> coalesce(r.esperado, 0)
      order by d.nombre, p.sku
    ) x)

  union all
  select 'S2 reservas activas sin fila en stock_x_deposito', 'error',
    (select jsonb_agg(x) from (
      select d.nombre as deposito, p.sku, r.esperado as reservas_activas
      from reservas_por_stock r
      join public.depositos d on d.id = r.deposito_id
      join public.productos p on p.id = r.producto_id
      where not exists (
        select 1 from public.stock_x_deposito s
        where s.deposito_id = r.deposito_id and s.producto_id = r.producto_id
      )
    ) x)

  union all
  select 'S3 reservas sin respaldo físico (comprometido > cantidad)', 'error',
    (select jsonb_agg(x) from (
      select d.nombre as deposito, p.sku, s.cantidad, s.comprometido
      from public.stock_x_deposito s
      join public.depositos d on d.id = s.deposito_id
      join public.productos p on p.id = s.producto_id
      where s.comprometido > s.cantidad
    ) x)

  union all
  select 'S4 productos publicados sin stock cargado en el depósito de e-commerce', 'aviso',
    (select jsonb_agg(x) from (
      select p.sku, p.nombre
      from public.productos p
      where p.publicado_web
        and not exists (
          select 1 from public.stock_x_deposito s
          where s.producto_id = p.id
            and s.deposito_id::text = (select deposito_texto from parametro_ecommerce)
        )
    ) x)

  union all
  select 'S5 productos de QA que siguen cargados (SKU QA14-xx)', 'aviso',
    (select jsonb_agg(x) from (
      select p.sku, p.nombre, p.publicado_web,
        (select coalesce(sum(s.cantidad), 0) from public.stock_x_deposito s where s.producto_id = p.id) as stock
      from public.productos p
      where p.sku ilike 'QA%'
    ) x)

  -- ------------------------------------------------------------- Movimientos
  union all
  select 'M1 movimientos sin detalle', 'error',
    (select jsonb_agg(x) from (
      select m.id, tm.codigo, m.estado_movimiento, m.fecha
      from public.movimientos_stock m
      join public.tipos_movimiento tm on tm.id = m.tipo_movimiento_id
      where not exists (select 1 from public.detalle_movimiento dm where dm.movimiento_id = m.id)
    ) x)

  union all
  select 'M2 transferencias con el mismo depósito de origen y destino', 'error',
    (select jsonb_agg(x) from (
      select m.id, m.fecha from public.movimientos_stock m
      where m.deposito_origen_id = m.deposito_destino_id
    ) x)

  union all
  select 'M3 movimientos pendientes con más de 7 días', 'aviso',
    (select jsonb_agg(x) from (
      select m.id, tm.codigo, m.fecha, m.observaciones
      from public.movimientos_stock m
      join public.tipos_movimiento tm on tm.id = m.tipo_movimiento_id
      where m.estado_movimiento = 'pendiente' and m.fecha < now() - interval '7 days'
    ) x)

  union all
  select 'M4 stock físico que no explican los movimientos confirmados', 'info',
    (select jsonb_agg(x) from (
      select d.nombre as deposito, p.sku, s.cantidad, coalesce(sm.saldo, 0) as saldo_movimientos
      from public.stock_x_deposito s
      join public.depositos d on d.id = s.deposito_id
      join public.productos p on p.id = s.producto_id
      left join saldo_movimientos sm
        on sm.deposito_id = s.deposito_id and sm.producto_id = s.producto_id
      where s.cantidad <> coalesce(sm.saldo, 0)
      order by d.nombre, p.sku
    ) x)

  union all
  select 'M5 egresos de entrega sin referencia a la venta o pedido', 'info',
    (select jsonb_agg(x) from (
      select m.id, m.fecha from public.movimientos_stock m
      where m.observaciones = 'Egreso por venta entregada'
    ) x)

  -- ------------------------------------------------------------ Pedidos web
  union all
  select 'P1 pedidos web por estado', 'info',
    (select jsonb_agg(x) from (
      select estado, count(*) as pedidos, count(*) filter (where checkout_id is null) as sin_checkout
      from public.pedidos_web group by estado order by estado
    ) x)

  union all
  select 'P2 pedidos sin checkout (no reservaron stock) en estado no final', 'aviso',
    (select jsonb_agg(x) from (
      select numero, estado, created_at from public.pedidos_web
      where checkout_id is null and estado not in ('Entregado', 'Cancelado')
    ) x)

  union all
  select 'P3 total del pedido distinto de la suma del detalle', 'error',
    (select jsonb_agg(x) from (
      select p.numero, p.total, coalesce(sum(d.subtotal), 0) as suma_detalle
      from public.pedidos_web p
      left join public.detalle_pedido_web d on d.pedido_id = p.id
      group by p.id
      having p.total <> coalesce(sum(d.subtotal), 0)
    ) x)

  union all
  select 'P4 entrega inconsistente con el domicilio', 'error',
    (select jsonb_agg(x) from (
      select p.numero, p.tipo_entrega, p.domicilio_id,
        case
          when p.tipo_entrega = 'envio' and p.domicilio_id is null then 'envío sin domicilio'
          when p.tipo_entrega = 'retiro' and p.domicilio_id is not null then 'retiro con domicilio'
          else 'domicilio de otro cliente'
        end as problema
      from public.pedidos_web p
      left join public.domicilios_cliente dc on dc.id = p.domicilio_id
      where (p.tipo_entrega = 'envio' and p.domicilio_id is null)
         or (p.tipo_entrega = 'retiro' and p.domicilio_id is not null)
         or (dc.id is not null and dc.cliente_id <> p.cliente_id)
    ) x)

  union all
  select 'P5 historial que no coincide con el estado del pedido', 'error',
    (select jsonb_agg(x) from (
      select p.numero, p.estado, uh.estado_nuevo as ultimo_historial
      from public.pedidos_web p
      left join ultimo_historial uh on uh.pedido_id = p.id
      where uh.estado_nuevo is distinct from p.estado
    ) x)

  union all
  select 'P6 pedidos pagados o avanzados sin datos del pago', 'aviso',
    (select jsonb_agg(x) from (
      select numero, estado, referencia_pago, pagado_at
      from public.pedidos_web
      where estado not in ('Pendiente de pago', 'Cancelado')
        and (referencia_pago is null or pagado_at is null)
    ) x)

  union all
  select 'P7 pedidos cancelados sin fecha de cancelación', 'aviso',
    (select jsonb_agg(x) from (
      select numero, created_at from public.pedidos_web
      where estado = 'Cancelado' and cancelado_at is null
    ) x)

  union all
  select 'P8 pedidos vencidos que el cron no canceló', 'error',
    (select jsonb_agg(x) from (
      select numero, vence_at from public.pedidos_web
      where estado = 'Pendiente de pago' and vence_at < now() - interval '15 minutes'
    ) x)

  union all
  select 'P9 pedidos cancelados con pago aprobado (reembolso pendiente)', 'error',
    (select jsonb_agg(x) from (
      select numero, ultimo_pago_referencia, pago_motivo, cancelado_at
      from public.pedidos_web
      where estado = 'Cancelado' and pago_estado = 'approved'
    ) x)

  union all
  select 'P10 pedidos sin detalle o con un producto repetido', 'error',
    (select jsonb_agg(x) from (
      select p.numero, 'sin detalle' as problema
      from public.pedidos_web p
      where not exists (select 1 from public.detalle_pedido_web d where d.pedido_id = p.id)
      union all
      select p.numero, 'producto repetido: ' || pr.sku
      from public.detalle_pedido_web d
      join public.pedidos_web p on p.id = d.pedido_id
      join public.productos pr on pr.id = d.producto_id
      group by p.numero, pr.sku
      having count(*) > 1
    ) x)

  union all
  select 'P11 clientes con más de un pedido pendiente de pago a la vez', 'aviso',
    (select jsonb_agg(x) from (
      select c.numero as cliente, count(*) as pendientes
      from public.pedidos_web p
      join public.clientes c on c.id = p.cliente_id
      where p.estado = 'Pendiente de pago'
      group by c.numero
      having count(*) > 1
    ) x)

  union all
  select 'P12 pedidos activos de checkout fuera del depósito de e-commerce actual', 'info',
    (select jsonb_agg(x) from (
      select p.numero, p.estado, d.nombre as deposito
      from public.pedidos_web p
      join public.depositos d on d.id = p.deposito_id
      where p.checkout_id is not null
        and p.estado not in ('Entregado', 'Cancelado')
        and p.deposito_id::text is distinct from (select deposito_texto from parametro_ecommerce)
    ) x)

  -- --------------------------------------------------------------- Clientes
  union all
  select 'C1 pedidos de clientes sin cuenta web o no activos', 'aviso',
    (select jsonb_agg(x) from (
      select p.numero, p.estado, c.numero as cliente, c.estado as estado_cliente,
        c.usuario_web_id is not null as tiene_cuenta_web
      from public.pedidos_web p
      join public.clientes c on c.id = p.cliente_id
      where c.usuario_web_id is null
         or (c.estado <> 'Activo' and p.estado not in ('Entregado', 'Cancelado'))
    ) x)

  union all
  select 'C2 clientes posiblemente duplicados (mismo email o DNI dentro de un CUIT)', 'aviso',
    (select jsonb_agg(x) from (
      select 'email: ' || lower(btrim(email)) as clave, jsonb_agg(numero order by numero) as clientes
      from public.clientes
      where nullif(btrim(email), '') is not null
      group by lower(btrim(email))
      having count(*) > 1
      union all
      select 'documento: ' || dni.numero_documento, jsonb_build_array(dni.numero, cuit.numero)
      from public.clientes dni
      join public.clientes cuit
        on cuit.tipo_documento = 'CUIT'
       and dni.tipo_documento = 'DNI'
       and substr(cuit.numero_documento, 3, 8) = lpad(dni.numero_documento, 8, '0')
    ) x)

  union all
  select 'C3 carritos con productos que ya no están en el catálogo web', 'info',
    (select jsonb_agg(x) from (
      select c.numero as cliente, p.sku
      from public.items_carrito ic
      join public.carritos ca on ca.id = ic.carrito_id
      join public.clientes c on c.id = ca.cliente_id
      join public.productos p on p.id = ic.producto_id
      where not exists (select 1 from public.v_catalogo_web w where w.id = ic.producto_id)
    ) x)

  -- ------------------------------------------------------------- Relaciones
  union all
  select 'R1 constraints sin validar (NOT VALID)', 'info',
    (select jsonb_agg(x) from (
      select c.conrelid::regclass::text as tabla, c.conname as constraint
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
      where n.nspname = 'public' and not c.convalidated
    ) x)

  union all
  select 'R2 job de vencimiento de pedidos programado', 'error',
    (select jsonb_agg(x) from (
      select 'no existe el job expirar-pedidos-web' as problema
      where to_regclass('cron.job') is not null
        and not exists (select 1 from cron.job where jobname = 'expirar-pedidos-web')
    ) x)
)
select
  control,
  severidad,
  coalesce(jsonb_array_length(filas), 0) as cantidad,
  coalesce((
    select jsonb_agg(f) from (
      select f from jsonb_array_elements(coalesce(filas, '[]'::jsonb)) f limit 20
    ) s
  ), '[]'::jsonb) as muestra
from controles
order by
  coalesce(jsonb_array_length(filas), 0) = 0,
  case severidad when 'error' then 1 when 'aviso' then 2 else 3 end,
  control;

commit;
