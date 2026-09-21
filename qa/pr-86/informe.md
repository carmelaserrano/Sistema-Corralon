# QA integral — PR #86 — S2-17 Vinculación manual de notas a facturas

Fecha: 2026-09-10  
Rama evaluada: `feature/S2-15-orden-de-pago`  
Commit: `73e7c3d326997ad60884d476f56ccadd78c7a27a`

## Resultado ejecutivo

Los vínculos manuales, topes, recálculos, baja lógica, auditoría y bloqueo de factura pagada funcionaron con datos reales. Se detectaron dos brechas de integridad/UX: el sistema ofrece nuevamente el mismo par nota-factura parcialmente vinculado aunque el backend lo prohíbe, y la tabla `imputaciones` continúa admitiendo escrituras directas que evitan las validaciones de la RPC.

**Resultado: REQUEST CHANGES.**

## Resultado por criterio — formato para matriz QA

| CA | Estado | Resultado obtenido | Defecto asociado | Severidad | Evidencia textual |
|---|---|---|---|---|---|
| CA1 | APROBADO | Crédito Disponible vinculado manualmente a factura del mismo proveedor por 20. | — | — | Nota 30→saldo 10/Aplicada parcial; factura 130→110. |
| CA2 | APROBADO | El detalle de factura mostró las cuatro notas activas y su fecha/importe. | D-86-01 | Media | Sección `Notas de Crédito/Débito vinculadas`, 4 filas. |
| CA3 | APROBADO | Débito manual por 10 elevó el saldo de factura 110→120. | — | — | Nota `M 8587-00008502`, saldo 0/Aplicada. |
| CA4 | APROBADO | Crédito manual por 20 redujo el saldo 130→110. | — | — | Nota `A 8587-00008501`, saldo 10/Aplicada parcial. |
| CA5 | APROBADO | Crédito tuvo máximo 30 y débito máximo 10; valores 31/11 quedaron inválidos sin request. | — | — | Inputs `max=30` y `max=10`; RPC también calcula topes bajo lock. |
| CA6 | APROBADO | Desvincular restituyó nota 10→30 y factura 110→130; revincular volvió a aplicar 20. | — | — | Fila anterior conservada con `anulado_by/anulado_at`; nueva fila activa. |
| CA7 | APROBADO | Con factura Pagada, vincular y desvincular fueron rechazados. | — | — | Ambas RPC respondieron `IM003`; UI mostró el bloqueo y ocultó Desvincular. |
| CA8 | APROBADO | Alta y baja lógica registraron usuario y fecha/hora. | — | — | `created_by/created_at` y `updated_by/updated_at/anulado_by/anulado_at` coinciden con usuario QA. |

## Defectos

### D-86-01 — Se ofrece un par nota-factura que el backend rechaza como duplicado

- Severidad: **Media**.
- Descripción: una nota parcialmente aplicada conserva saldo y aparece como disponible; el selector también vuelve a ofrecer la factura a la que ya tiene una imputación activa.
- Esperado: excluir ese par o permitir incrementar la imputación existente de forma controlada.
- Obtenido: al elegir el saldo residual para la misma factura, la RPC responde `La nota ... ya está imputada a esa factura`.
- Impacto: flujo sin salida cuando esa es la única factura pendiente del proveedor; también afectó la selección desde Orden de Pago.
- Causa probable: `getNotasDisponiblesDelProveedor`/`getFacturasConSaldoDelProveedor` no cruzan imputaciones activas y existe unique por `(nota_id, factura_id)`.
- Archivos probables: `notasProveedorApi.js:214-226`, `facturasProveedorApi.js:344-376`, `0025_vinculacion_notas_facturas.sql:57-60`.

### D-86-02 — Escritura directa en `imputaciones` evita reglas de integridad de la RPC

- Severidad: **Alta**.
- Descripción: la policy permite `INSERT/UPDATE` directo a usuarios con permiso; proveedor, estado de factura y duplicado se validan únicamente dentro de `vincular_nota_factura`.
- Esperado: las reglas críticas deben estar garantizadas en base para cualquier escritura autorizada, o revocar escritura directa y permitir solo la RPC.
- Obtenido: un cliente autenticado podría insertar una imputación entre proveedores distintos o contra una factura pagada y dejar que los triggers recalculen saldos.
- Causa probable: policy `for all` sobre la tabla sin trigger equivalente de validación.
- Archivo probable: `supabase/migrations/0025_vinculacion_notas_facturas.sql:65-78` y `:306-378`; policy ampliada en 0026.

## Chequeos técnicos

- `imputaciones` es la fuente de verdad; `factura_id` directo se migra y elimina.
- No se observó doble contabilización en los saldos del flujo válido.
- Vínculo/desvínculo mediante RPC y recálculo ocurrieron atómicamente.
- Baja lógica preservó trazabilidad completa.
- Crédito resta y débito suma con importes siempre positivos.
- `fn_recalcular_saldo_nc` usa tabla/columna nuevas.

## Ejecución

- Tests focalizados compartidos: 4 archivos, 63/63 aprobados.
- Lint: aprobado con 1 warning preexistente.
- Build: aprobado.
- Consola/page errors en flujo válido: 0.
- Requests fallidas inesperadas: 0; los 400/409 documentados corresponden a pruebas negativas o defectos reproducidos.
- Screenshots: 0.

## Conclusión

CA aprobados: **1–8**.  
CA fallidos: **ninguno**.  
CA bloqueados: **ninguno**.  
Defectos: **D-86-01 Media, D-86-02 Alta**.  
**REQUEST CHANGES.**
