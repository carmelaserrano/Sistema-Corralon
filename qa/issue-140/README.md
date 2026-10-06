# Issue #140 — Verificación integral del ciclo de ventas, reserva de stock y clientes

Evidencia de la verificación contra la base de datos. No se escribió nada en
Supabase real: todo corrió en bases efímeras (PGlite y Postgres 15 en Docker).

## Cómo reproducir

```bash
npm install --prefix .temp/ventas-db --no-save --ignore-scripts @electric-sql/pglite
node scripts/probar-ciclo-ventas.mjs
```

El script aplica todas las migraciones y ejecuta los escenarios CA-01 a CA-07
más las regresiones de los hallazgos. Con `MIGRACIONES_DIR=<carpeta>` se puede
probar otra combinación de migraciones.

- `antes-de-la-correccion.txt`: resultado **sin** la migración 0059 (7 fallas).
- `despues-de-la-correccion.txt`: resultado con la 0059 (todo OK).
- `despues-con-pr143.txt`: 0059 aplicada después de 0055–0058 del PR #143.

## Resultado por criterio de aceptación

| CA | Estado | Cómo se verifica |
|---|---|---|
| CA-01 Persistencia | OK | venta `Pendiente`, correlativo, `detalle_venta`, `historial_estado_venta` |
| CA-02 Comprometido | OK | `comprometido` sube y `cantidad` física no cambia |
| CA-03 Stock insuficiente | OK | `STOCK_INSUFICIENTE` con detalle; rollback total |
| CA-04 Facturación y cobro | OK (RPC + UI) | cobro = total, factura A/B con IVA 21 %, sin doble factura. UI: botón *Registrar cobro* en `VentaDetalle` |
| CA-05 Entrega | OK | egresa físico, libera comprometido, movimiento `Venta #N` |
| CA-06 Anulación | OK | Pendiente libera stock; Facturada solo con NC total; NC parcial no anula |
| CA-07 Historial | OK | ventas, comprobantes y cobros asociados al cliente |

"Saldo pendiente a cero" (CA-04) se verifica como *cobro registrado = total de
la venta*: el modelo no tiene pagos parciales ni saldo (decisión D4).

## Hallazgos corregidos (migración 0059 + frontend)

| # | Problema | Corrección |
|---|---|---|
| H1 | Con backorder, anular / NC total / entregar liberaban o egresaban la `cantidad` completa: fallaba por CHECK de stock o, peor, liberaba reservas de otras ventas | Se usa `cantidad - cantidad_backorder`. Entregar una venta con backorder pendiente se bloquea con mensaje claro (D1-B) |
| H2 | `ModalCobro` no estaba montado en ninguna pantalla | Botón *Registrar cobro* en `VentaDetalle` (D3-A) |
| H3 | Se podía anular una venta `Pendiente` con cobro (cobros inmutables → dinero huérfano) | Se rechaza e indica facturar + Nota de Crédito (D2-A) |
| H4 | El movimiento de stock del egreso no decía la venta | `egresar_comprometido(uuid, jsonb, text)`; la firma de 2 parámetros (pedidos web) se conserva (D5-A) |
| H5 | Mensajes crudos (UUID en `PRECIO_DESACTUALIZADO`, `23505`, `23514`) | Mapeo en `ventasApi.js` / `estadosVentaApi.js`; recarga de precios en `NuevaVentaPage` |
| H6 | Producto repetido en el payload fallaba tarde con `23505` | Validación explícita al inicio de `registrar_venta` |

Pendiente fuera de alcance: cumplimiento posterior del backorder (convertirlo en
reserva cuando entra stock), cuenta corriente con libro de movimientos y pagos
parciales.

## Concurrencia (Postgres 15 real en Docker)

Scripts en `concurrencia/`. Cada sesión mantiene la transacción abierta 2 s
(`pg_sleep`) para forzar el solapamiento.

- **Dos cajeros venden la última unidad a la vez:** el cajero A obtiene la
  venta; el B recibe `STOCK_INSUFICIENTE`. Resultado: 1 venta,
  `cantidad=1, comprometido=1`. Sin sobreventa.
- **Dos anulaciones simultáneas de la misma venta:** una anula; la otra recibe
  `Transición no permitida: Anulada → Anulada`. Resultado: `comprometido=0`, una
  sola fila `Anulada` en el historial (no se libera dos veces).

## Notas de entorno

- `0027_orden_de_pago.sql` referencia `nota_id`, columna que crea la `0029`: la
  base no se puede construir desde cero sin omitirla. Es del circuito de
  compras (issue #141); el script la omite con un aviso.
- La migración 0059 va después de 0055–0058 (PR #143, que redefine
  `cambiar_estado_venta` como `SECURITY DEFINER` y revoca permisos de las
  primitivas de stock). Se verificó el orden con y sin ese PR. `npm run
  validate:migrations` marca el hueco 0055–0058 hasta que #143 se mergee.
