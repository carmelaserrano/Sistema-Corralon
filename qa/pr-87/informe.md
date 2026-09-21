# QA integral — PR #87 — S2-15 Orden de Pago

Fecha: 2026-09-10  
Rama evaluada: `feature/S2-15-orden-de-pago`  
Commit: `73e7c3d326997ad60884d476f56ccadd78c7a27a`

## Resultado ejecutivo

Se confirmó una orden completa y transaccional, con número, auditoría, imputaciones, estados finales, historial e inmutabilidad correctos. El cálculo mostrado de notas es correcto, pero la validación de UI y la RPC comparan el importe de la orden contra el subtotal de facturas y no contra el total neto. Por ello los casos con crédito o débito neto distinto de cero no pueden confirmarse coherentemente. También se ofrece una nota parcialmente aplicada para la misma factura aunque esa combinación será rechazada como duplicada.

**Resultado: REQUEST CHANGES.**

## Resultado por criterio — formato para matriz QA

| Criterio | Estado | Resultado obtenido | Defecto asociado | Severidad | Evidencia textual |
|---|---|---|---|---|---|
| CA1 | APROBADO | El formulario comienza por Proveedor. | — | — | Sección Proveedor es la primera. |
| CA2 | APROBADO | El resto permanece deshabilitado hasta elegir proveedor. | — | — | Medio de pago y confirmación deshabilitados antes de seleccionar. |
| CA3 | APROBADO | Solo se listó la factura Impaga/Pagada parcial del proveedor. | — | — | Única fila `M 0084-00846477`. |
| CA4 | APROBADO | Se mostró saldo pendiente 120 antes de pagar. | — | — | Valor coincide con 130−20+10. |
| CA5 | APROBADO | La factura mostró las notas ya imputadas y sus importes. | — | — | Crédito A por 20 y Débito M por 10 visibles bajo la factura. |
| CA6 | APROBADO | Se listaron notas con saldo disponible del mismo proveedor. | D-87-02 | Media | Crédito residual 10 y notas nuevas QA visibles. |
| CA7 | APROBADO | Las notas son opcionales; el backend acepta `p_notas=[]`. | — | — | No existe validación que exija seleccionar notas; test unitario cubre el caso. |
| CA8 | **FALLIDO** | La UI muestra que el crédito reduce 120→110, pero impide confirmar importe 110. | D-87-01 | Alta | Con importe 110, botón deshabilitado y mensaje contra subtotal 120. |
| CA9 | **FALLIDO** | El débito suma en la presentación, pero la validación sigue exigiendo el subtotal sin notas. | D-87-01 | Alta | Código simétrico: total mostrado suma débito, `diferencia` ignora notas. |
| CA10 | **FALLIDO** | Se visualiza `subtotal − créditos + débitos`, pero no se usa ese total para validar/confirmar. | D-87-01 | Alta | Total mostrado 110; UI habilitó 120. |
| CA11 | APROBADO | Topes de crédito/débito se aplican y la RPC repite las validaciones con locks. | — | — | Máximos 30 y 10 verificados; valores superiores bloqueados. |
| CA12 | APROBADO | Orden balanceada confirmó y actualizó factura/notas. | — | — | Factura saldo 0/Pagada; notas de orden saldo 0/Aplicada. |
| CA13 | APROBADO | Orden #3 guardó fecha, medio, referencia, observaciones y usuario. | — | — | Fecha 10/09/2026, Efectivo, `QA-8587-INTEGRAL`, estado Confirmada. |
| CA14 | APROBADO | La orden confirmada no pudo editarse ni eliminarse. | — | — | Update respondió `OP007`; DELETE afectó 0 filas y la orden permaneció. |
| CA15 | APROBADO | Historial por proveedor/fecha y detalle mostraron número, importe, medio, factura y notas. | — | — | Fila #3 y detalle con factura M, Crédito C y Débito B. |

## Defectos

### D-87-01 — Total de la orden se valida contra subtotal y no contra el neto de notas

- Severidad: **Alta**.
- Descripción: `calcularTotales` presenta correctamente `subtotal - créditos + débitos`, pero `diferencia` compara `importe_total` con `totales.subtotal`. La RPC también suma únicamente `p_facturas` y exige que sea igual a `p_importe_total`.
- Pasos:
  1. Seleccionar factura con saldo 120.
  2. Aplicar crédito disponible por 10.
  3. Observar Total a pagar 110.
  4. Ingresar 110: el botón queda deshabilitado.
  5. Ingresar 120: el botón queda habilitado aunque contradice el total mostrado.
- Esperado: validar y persistir 110 como efectivo de la orden.
- Obtenido: UI exige 120; la RPC valida el mismo subtotal incorrecto.
- Impacto: órdenes con efecto neto de notas distinto de cero no se pueden confirmar de forma coherente; un débito tiene el problema inverso.
- Causa probable: uso de `totales.subtotal` en lugar de `totales.total` y cálculo SQL que ignora `p_notas`.
- Archivos probables: `OrdenesPagoPage.jsx:240-243,529-544`; `0026_orden_de_pago.sql:204-215`.

### D-87-02 — Orden ofrece una nota residual ya vinculada a la factura seleccionada

- Severidad: **Media**.
- Descripción: una nota parcialmente aplicada se lista por tener saldo, aunque ya posee una imputación activa con la única factura elegida.
- Pasos:
  1. Tener crédito A por 30, imputado parcialmente por 20 a factura M.
  2. Crear una Orden de Pago para la misma factura.
  3. Seleccionar el crédito residual 10 y esa factura.
  4. Confirmar.
- Esperado: excluir la combinación, ampliar la imputación existente o explicar previamente que no es elegible.
- Obtenido: RPC HTTP 400, `La nota A-8587-00008501 ya está imputada a esa factura`; rollback correcto y 0 órdenes creadas.
- Causa probable: lista de notas basada solo en `saldo_pendiente > 0`, sin cruzar imputaciones activas por factura.
- Archivos probables: `notasProveedorApi.js:214-226`, `OrdenesPagoPage.jsx:124-238`, `0026_orden_de_pago.sql:274-282`.

## Evidencia del flujo positivo

- Factura antes de orden: total 130, saldo 120, Pagada parcial.
- Notas seleccionadas dentro de la orden: Crédito C 10 y Débito B 10.
- Fórmula visible: 120 − 10 + 10 = 120.
- Orden: #3, importe 120, Efectivo, Confirmada.
- Factura después: saldo 0, Pagada.
- Ambas notas de la orden: saldo 0, Aplicada.
- Imputaciones de notas: `pago_origen_id=386f4b92-fa51-4b82-900d-ac2fadfe386e`.
- Imputación de efectivo: 120, ligada por `pago_id`.
- Update posterior: bloqueado con `OP007`.

## Chequeos técnicos

- `crear_orden_pago()` ejecuta cabecera, notas y efectivo en una sola transacción.
- Aplica notas antes del efectivo.
- El intento fallido dejó 0 pagos y no alteró saldos: rollback comprobado.
- No se observó doble contabilización en el flujo válido.
- `pago_origen_id` conservó trazabilidad de las dos notas.
- Permisos QA de registrar/anular pago: activos.

## Ejecución

- Tests focalizados compartidos: 4 archivos, 63/63 aprobados.
- Lint: 0 errores, 1 warning preexistente.
- Build: aprobado.
- Flujo positivo: 0 console.error, 0 page errors, 0 requests fallidas.
- Pruebas negativas: HTTP 400 esperado al reproducir D-87-02; rollback confirmado.
- Screenshots: 0.

## Conclusión

Criterios aprobados: **1–7, 11–15**.  
Criterios fallidos: **8, 9, 10**.  
Criterios bloqueados: **ninguno**.  
Defectos: **D-87-01 Alta, D-87-02 Media**.  
**REQUEST CHANGES.**
