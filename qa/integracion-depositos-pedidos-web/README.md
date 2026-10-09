# Integración BDD: depósitos, pedidos web y consistencia general

Revisión de cómo se conectan depósitos, stock, movimientos y pedidos web, y de
la consistencia general de la base. No se escribió nada en Supabase real: la
revisión es estática (migraciones 0001–0062) y lo que se encontró se reprodujo
y corrigió en una base efímera (PGlite).

## Entregables

| Archivo | Qué es |
|---|---|
| [`scripts/diagnostico_integracion_pedidos_web.sql`](../../scripts/diagnostico_integracion_pedidos_web.sql) | Diagnóstico **de solo lectura** para correr en el SQL Editor de Supabase. 31 controles con severidad `error` / `aviso` / `info` |
| [`supabase/migrations/0063_integridad_depositos_pedidos_web.sql`](../../supabase/migrations/0063_integridad_depositos_pedidos_web.sql) | Corrección de los hallazgos H1–H7 |
| [`scripts/probar-integracion-pedidos-web.mjs`](../../scripts/probar-integracion-pedidos-web.mjs) | Reproduce el estado roto, corre el diagnóstico, aplica la 0063 y verifica cada corrección |
| `resultado-verificacion.txt` | Salida de la verificación (18/18 OK) |

## Cómo reproducir

```bash
npm install --prefix .temp/ventas-db --no-save --ignore-scripts @electric-sql/pglite
MOSTRAR_DIAGNOSTICO=1 node scripts/probar-integracion-pedidos-web.mjs
```

## Orden sugerido en la base real

1. Correr `scripts/diagnostico_integracion_pedidos_web.sql` y guardar el JSON (foto del "antes").
2. Aplicar la 0063. Sus `NOTICE` dicen cuántas filas de stock se corrigieron y si alguna constraint quedó `NOT VALID`.
3. Volver a correr el diagnóstico. Lo que quede en `error` necesita una decisión manual (ver "Pendientes").
4. Revisar `select * from ajustes_comprometido_stock` para ver cada reserva corregida.

## Checklist

| Ítem | Resultado |
|---|---|
| Revisar depósitos existentes | Hay 3 depósitos (0005). El de e-commerce es un uuid guardado en `parametros_ventas` **sin FK** → **H6**. El seed de 0053 deja a Sucursal Norte (capacidad 5.000) con más de 5.300 unidades: control D2 |
| Verificar stock por depósito | La 0053 puso `comprometido = 0` en el depósito de e-commerce → **H1**. Controles S1–S5 |
| Revisar movimientos de stock | Ingresos, egresos, transferencias y ajustes validan el disponible (`cantidad - comprometido`), así que no consumen reservas. Las entregas de pedidos web no dicen qué pedido fue → **H3**. Egresar sin fila de stock dejaba un movimiento sin descontar → **H4**. Controles M1–M5 |
| Verificar pedidos web generados | Totales, detalle, historial y datos de pago: controles P1–P12. Los 2 pedidos seed de 0033 no tienen `checkout_id`, por diseño (no reservaron stock) |
| Relación de pedidos web con clientes | FK `cliente_id` correcta y RLS `*_select_propio` correcta. Faltaba garantizar que el domicilio sea del mismo cliente y que coincida con el tipo de entrega → **H7**. Controles C1–C3 |
| Impacto de pedidos web sobre disponibilidad | Catálogo, carrito y checkout usan el mismo depósito (D-S3-03). El cron de vencimiento se frenaba entero por un solo pedido → **H2** |
| Verificar estados de pedidos | La matriz de transiciones de 0057 está bien. Un pago aprobado sobre un pedido ya cancelado se perdía → **H5** |
| Detectar datos duplicados o inconsistentes | Controles D3, C2, P10, P11 y S5 (los productos `QA14-xx` siguen cargados y la 0053 les asignó stock y precio) |
| Revisar relaciones principales | Las FK de stock, pedidos, ventas y movimientos están bien. Lo que faltaba (depósito de e-commerce, domicilio↔cliente, producto único por pedido) va en la 0063. Control R1 |
| Corregir inconsistencias detectadas | Migración 0063 (H1–H7) |

## Hallazgos y corrección

| # | Severidad | Problema | Corrección (0063) |
|---|---|---|---|
| H1 | Alta | La 0053 (`on conflict do update set comprometido = 0`) borró las reservas de los pedidos y ventas abiertos. Cancelarlos o entregarlos fallaba por `comprometido_nonneg`; con stock compartido, se comía la reserva de otra operación | `v_reservas_stock` + `v_control_comprometido` muestran las diferencias. `reconciliar_comprometido_stock()` recalcula y deja cada cambio en `ajustes_comprometido_stock`. La migración la ejecuta una vez |
| H2 | Alta | `cancelar_pedidos_web_vencidos` corre todo en una transacción: si un pedido no puede liberar su reserva, se revierte el lote completo y **el cron no vuelve a cancelar ningún pedido**, que quedan reteniendo stock | Cada pedido se procesa en su propio bloque; el que falla queda como `WARNING` y en el control P8 |
| H3 | Media | El egreso de una entrega web quedaba como "Egreso por venta entregada", sin decir qué pedido fue | `avanzar_estado_pedido` pasa `'Pedido web #N'` |
| H4 | Media | `liberar_stock` / `egresar_comprometido` no verificaban que existiera la fila de stock: liberaban en silencio o dejaban un `detalle_movimiento` sin descontar stock | Error `RESERVA_INCONSISTENTE` con un hint que lleva a `v_control_comprometido` |
| H5 | Media | Pago aprobado después de que el cron canceló el pedido: no quedaba registro y el cliente perdía el dinero sin rastro | Se guardan referencia y estado del pago con el motivo "corresponde reembolso"; el pedido no se reabre. Control P9 |
| H6 | Media | `deposito_ecommerce` podía apuntar a un depósito inexistente o borrado → la tienda pasaba a "Sin stock" en silencio | Triggers que validan el parámetro y bloquean el borrado del depósito configurado |
| H8 | Baja | Base real: los pedidos seed #1 y #2 (0033) no tienen historial (P5). Además, las constraints de cantidades enteras de carrito, pedidos y movimientos seguían `NOT VALID` (R1) | Se reconstruye una fila de alta del historial con el estado actual y la fecha de creación, sin pasos inventados. Se validan las constraints que los datos ya cumplen |
| H7 | Baja | Sin garantía de envío ⇔ domicilio, domicilio del mismo cliente ni producto único por pedido | `chk_pedido_web_domicilio_entrega`, FK compuesta `fk_pedido_web_domicilio_cliente` e índice `ux_detalle_pedido_web_producto`. Se validan solo si los datos actuales cumplen |

## Verificación

`scripts/probar-integracion-pedidos-web.mjs` (ver `resultado-verificacion.txt`):

- **Antes** (hasta 0062, con las reservas puestas en 0 como dejó la 0053): el diagnóstico detecta S1 y P8, el cron falla y no cancela ni siquiera el pedido sano, y cancelar a mano falla.
- **Después** (con 0063): los 15 escenarios de corrección pasan y el diagnóstico final no tiene errores de reservas, pedidos ni relaciones.

Regresión de ventas (`scripts/probar-ciclo-ventas.mjs`, issue #140): los 20
escenarios pasan **con y sin** la 0063, usando una sesión de caja abierta.
Sin la caja, 8 escenarios fallan en `develop` por la 0062 ("Debe abrir una caja
antes de registrar un cobro"); ese script quedó desactualizado y no tiene que
ver con este cambio. Además, en `develop` el script se corta en la 0059 si la
0027 no se aplica después de la 0029 (issue #141).

## Resultado en la base real (diagnóstico del 2026-10-07, antes de la 0063)

| Control | Resultado | Qué significa |
|---|---|---|
| S1, S2, S3 | 0 | Las reservas cuadran: la 0053 no dejó reservas rotas. La reconciliación de la 0063 no va a cambiar filas; queda como protección |
| P5 | **2 (error)** | Pedidos seed #1 y #2 sin historial → se corrige con la 0063 (H8) |
| C1, P2, P6 | 2 / 2 / 1 | Los mismos pedidos seed: cliente #2 sin cuenta web, sin checkout, y el #2 "Pagado" sin `pagado_at`. El #1 tiene `vence_at` nulo y el cron nunca lo va a cancelar |
| D2 | 1 | Sucursal Norte: 11.358 unidades con capacidad de 5.000 |
| M3 | 1 | Ingreso pendiente desde el 2026-09-03 con observación "bf" (parece un dato de prueba) |
| S5 | 9 | 6 productos `QA14-xx` publicados en la tienda con stock, más `QA14-07`, `QA14-08` y `QA-S3-18-001` |
| M4 | 41 | Stock cargado sin movimientos (seeds de 0053 y cargas directas). Informativo |
| R1 | 7 | 3 de cantidades enteras (se validan con la 0063 si los datos cumplen) y 4 de compras/recepciones (fuera de alcance) |
| Resto de los errores | 0 | Depósito de e-commerce, movimientos, totales, domicilios, cron y pagos sin problemas |

## Pendientes (requieren decisión, no se tocaron)

- **Pedidos seed #1 y #2:** quedan con historial después de la 0063. Si no se usan para demos, conviene cancelar el #1 desde Pedidos web (no toca stock porque no tiene checkout); si no, queda "Pendiente de pago" para siempre.
- **Movimiento pendiente "bf" (M3):** confirmarlo o cancelarlo desde Movimientos.

- **Capacidad de Sucursal Norte (D2):** el seed de 0053 la deja por encima de 5.000 unidades. Hay que subir la capacidad o mover stock. La capacidad no se valida en ningún movimiento.
- **Productos `QA14-xx` (S5):** la 0053 los publicó con precio y stock. Hay que decidir si se borran o se despublican.
- **Pedidos pendientes simultáneos (P11):** un cliente puede generar varios checkouts desde el mismo carrito y cada uno reserva stock durante 60 minutos.
- **Stock sin movimientos (M4):** las cargas iniciales (0053 y anteriores) no generaron movimientos. Es informativo; si se quiere trazabilidad completa, habría que registrar un ingreso inicial por la diferencia.
- **Reembolsos (P9):** no hay flujo de reembolso. El control lista los casos para gestionarlos a mano en Mercado Pago.
- Si después de la 0063 el control **S2** (reservas sin fila de stock) o **S3** (reservas sin respaldo físico) tienen filas, hay que resolverlas a mano (conteo físico o anulación de la operación).
