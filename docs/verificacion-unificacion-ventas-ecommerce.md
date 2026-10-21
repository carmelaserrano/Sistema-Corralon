# Comprobación de la unificación de ventas

## Qué se aplica

La migración es `supabase/migrations/0072_unificacion_ventas_ecommerce.sql`.
Debe aplicarse después de la 0071 y ejecutarse completa, incluyendo `BEGIN` y
`COMMIT`. No ejecutar fragmentos ni volver a ejecutarla si ya terminó correctamente.
Si hay un error, la transacción revierte los cambios; si el editor deja abierta la
transacción fallida, ejecutar `ROLLBACK` antes de corregir y reintentar.

Antes de aplicarla, guardar una copia recuperable de la base (esquema y datos).
Aplicar con la aplicación sin uso y luego iniciar el código de esta rama con
`npm run dev`. El código nuevo consulta columnas que aparecen con la migración.

La caja **Ecommerce** queda activa permanentemente y registra los pagos aprobados
automáticamente. Se identifica como un proceso del sistema, sin una cuenta de
usuario ni una sesión de caja física. Los pedidos conservan su preparación,
entrega y manejo de stock. Las ventas web pagadas quedan pendientes de **factura**,
pero ya cobradas; la facturación se puede realizar desde el detalle de venta.

## Controles de datos en SQL Editor

Son consultas de lectura. Guardar los resultados de la primera antes y después:
los totales, pedidos y stock deben mantenerse iguales durante la migración.

```sql
select
  (select count(*) from public.pedidos_web) as pedidos,
  (select count(*) from public.pedidos_web
    where pagado_at is not null and pago_estado = 'approved') as pedidos_pagados,
  (select sum(total) from public.pedidos_web
    where pagado_at is not null and pago_estado = 'approved') as importe_web,
  (select md5(coalesce(jsonb_agg(to_jsonb(s)
    order by s.deposito_id, s.producto_id)::text, '[]'))
    from public.stock_x_deposito s) as huella_stock,
  (select count(*) from public.movimientos_stock) as movimientos_stock;
```

En la revisión del 20/10/2026 había **16 pedidos pagados** que cumplían las
condiciones. El número puede aumentar si se hacen nuevas compras.

Después de migrar, esta consulta debe devolver **cero filas**. Detecta pedidos
sin su venta, diferencias de total/detalle, cobros o ingresos faltantes y cajas
incorrectas, además de fechas o actores incorrectos.

```sql
select p.numero as pedido, v.numero as venta
from public.pedidos_web p
left join public.ventas v on v.pedido_web_id = p.id
left join public.cajas c on c.id = v.caja_id
left join public.cobros_venta cv on cv.venta_id = v.id
where p.pagado_at is not null and p.pago_estado = 'approved'
  and (
    v.id is null or v.origen is distinct from 'ecommerce'
    or c.tipo_caja is distinct from 'ecommerce' or not c.activa
    or v.total is distinct from p.total
    or v.created_at is distinct from p.pagado_at
    or v.cliente_id is distinct from p.cliente_id
    or v.deposito_id is distinct from p.deposito_id
    or v.vendedor_id is not null
    or cv.total is distinct from p.total
    or cv.caja_id is distinct from v.caja_id
    or cv.created_at is distinct from p.pagado_at
    or cv.sesion_caja_id is not null or cv.created_by is not null
    or (select sum(d.subtotal) from public.detalle_venta d
        where d.venta_id = v.id) is distinct from p.total
    or (select sum(d.monto) from public.detalle_cobro d
        where d.cobro_id = cv.id) is distinct from p.total
    or (select sum(m.monto) from public.movimientos_caja m
        where m.venta_id = v.id and m.origen = 'ecommerce'
          and m.caja_id = v.caja_id and m.sesion_caja_id is null
          and m.created_by is null) is distinct from p.total
  );
```

Verificar la cantidad de ventas y que haya una única caja automática:

```sql
select origen, count(*) as ventas, sum(total) as total
from public.ventas group by origen;

select nombre, tipo_caja, activa, usuario_asignado_id
from public.cajas where tipo_caja = 'ecommerce';
-- Una fila: Ecommerce, ecommerce, true, NULL.

select pedido_web_id, count(*) from public.ventas
where pedido_web_id is not null group by pedido_web_id having count(*) > 1;
-- Cero filas.

select tgname, tgenabled from pg_trigger
where tgname in ('trg_cobros_venta_inmutables', 'trg_movimientos_caja_inmutables');
-- Ambas protecciones deben estar habilitadas: tgenabled = O.
```

## Recorrido en la aplicación

1. Entrar al sistema interno y abrir **Ventas y Facturación**. Deben aparecer las
   ventas anteriores y las web, identificadas como **Ecommerce · Caja Ecommerce**.
   Abrir una venta web: comprobar pedido, artículos, importe y cobro registrado.
2. Abrir **Gestión de cajas** con un administrador. Debe figurar Ecommerce activa,
   sin apertura/cierre de turno ni edición manual.
3. En la tienda, crear una compra y aprobar su pago. Debe generarse exactamente
   una venta, un cobro y un ingreso asociados a Ecommerce, aunque no haya una
   caja física abierta. Reintentar la confirmación no debe duplicarlos.
4. Rechazar otra compra: no debe aparecer como venta cobrada.
5. Gestionar preparación y entrega desde **Pedidos web**. El stock debe egresar
   una sola vez. No gestionar su entrega desde Supervisión de ventas.
6. Registrar una venta de mostrador y cobrarla con una caja física abierta.
   Debe facturarse y registrar su movimiento en esa caja. Probar también un
   ingreso/egreso manual y un recibo de cuenta corriente.
7. Abrir el informe de ingresos y comparar el total de tienda con la suma de
   pagos web del período. El pedido y su venta no deben sumar dos veces.

Las notas de crédito web se gestionan desde Ventas; la cancelación logística y
la liberación de reserva siguen en Pedidos web. Una nota de crédito no ejecuta
un reembolso en la pasarela.

## Pruebas locales

```powershell
npm test -- src/modules/ecommerce/api/unificacionVentas.integration.test.js
npm run build
npm run validate:migrations
```

La prueba de integración ejecuta la migración completa en PostgreSQL embebido
(PGlite), con datos históricos, tablas, funciones y triggers extraídos de las
migraciones del repositorio. No se conecta a Supabase. Cubre pagos, reintentos,
stock, cobro/factura de mostrador, movimientos manuales, recibos, informes y
protecciones de escritura. Las identidades y los permisos del fixture son
simulados: el recorrido con usuarios reales y la API de Supabase sigue siendo
la comprobación final después de aplicar la migración.

Resultado de la revisión local del 20/10/2026: las 18 pruebas SQL de esta HU,
la compilación y la validación de 72 migraciones pasaron. La suite general dio
1569 pruebas correctas y un fallo en `informeExcel.test.js`: la expectativa del
guion largo usa una codificación distinta a la del texto decodificado. Ese
archivo y su implementación de Excel no se modificaron en esta HU.
