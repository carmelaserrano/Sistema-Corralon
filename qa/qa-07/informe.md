# QA-07 / Issue #65 — Regresión de Stock y cierre Sprint 2

Fecha: 2026-09-11  
Rama: `develop`  
Commit: `67b5b227fcfd0282a0523d15ea504b39d00fe9b4`

## Resultado ejecutivo

- Regresión focalizada: **PASA**.
- Casos ejecutados: **15**.
- Aprobados: **15**.
- Fallidos: **0**.
- Bloqueados: **0**.
- Cobertura del alcance focalizado solicitado: **100%**.
- Sprint 2 apto para cierre desde QA: **SÍ CON PENDIENTES DOCUMENTADOS**.

## Casos de regresión

| Área | Caso | Resultado | Evidencia |
|---|---|---|---|
| Stock | Consulta de stock por depósito | APROBADO | Carga autenticada y consulta por depósito/producto sin errores. |
| Stock | Movimiento manual de ingreso | APROBADO | `QA-QA07-1789105154882-IN`: ART-000001 en Sucursal Norte 15→16. |
| Stock | Movimiento manual de egreso | APROBADO | `QA-QA07-1789105154882-OUT`: ART-000001 16→15. |
| Stock | Ingreso y egreso afectan exactamente la cantidad | APROBADO | Ambos movimientos fueron por una unidad y el saldo neto volvió a 15. |
| Stock | Sin movimientos duplicados | APROBADO | El historial mostró exactamente dos filas para el identificador QA: un Ingreso y un Egreso. |
| Stock | Stock por depósito consistente | APROBADO | La lectura posterior en Sucursal Norte informó nuevamente 15 unidades. |
| Stock | Historial/movimientos navegables | APROBADO | `Ver historial` mostró ambos movimientos confirmados con comprobante y observación. |
| Stock | Regresión Sprint 1 | APROBADO | Consulta, ingreso, egreso, validaciones y navegación cubiertos por E2E focalizado y 139 tests. |
| Compras | Crear Orden de Compra | APROBADO | Evidencia vigente de OC QA #8 y alta controlada #22. |
| Compras | Registrar recepción | APROBADO | Recepción #6 Confirmada; regresión de recepción 39/39 tests. |
| Compras | Actualizar estado de OC | APROBADO | OC #8 permanece Recibida y #9 conserva su ciclo con dos recepciones. |
| Compras | Recepción incrementa stock sin duplicar | APROBADO | Evidencia QA previa: +1 exacto para #8; #9 conserva 2 movimientos de recepción correspondientes a sus dos confirmaciones. |
| Tesorería | Factura de proveedor y saldo | APROBADO | Factura QA $100,00; saldo actual $0,00/Pagada. |
| Tesorería | Nota de crédito/débito y efecto | APROBADO | NC $10,00 aplicada: saldo 100→90 antes del pago. |
| Tesorería | Orden de Pago y saldo final | APROBADO | OP #4 por $90,00 Confirmada; saldo final $0,00/Pagada. |

## Automatización

Se ejecutaron únicamente pruebas focalizadas de Stock, Recepciones, OC, historial, facturas, notas, imputaciones y órdenes de pago:

- Archivos: **12/12 aprobados**.
- Tests: **139/139 aprobados**.
- Suite completa: no ejecutada.
- Warnings: únicamente avisos de configuración Vite/esbuild preexistentes; sin fallos.
- Navegador: 0 `console.error`, 0 excepciones JavaScript y 0 respuestas HTTP fallidas relevantes.

## Estado de issues de Compras

- Aceptadas: S2-11 (#89), S2-12 (#83, según estado de cierre indicado) y S2-14 (#90).
- No aceptadas: S2-08, S2-09 y S2-10.
- #89 y #90 ya están integradas en `develop`.
- S2-10 sigue fuera de `develop` en PR #91.
- Las correcciones de S2-09/CORR-04 siguen fuera de `develop` en PR #92.
- La PR #82 continúa abierta y no aceptada por paginación, multirrubro e integración de migración.

## Defectos abiertos por severidad

En la matriz QA-03 de Compras quedan **13 defectos agrupados**: 5 Alta, 7 Media y 1 Baja. Además permanecen las observaciones técnicas ya documentadas en #82 y en los ciclos de Facturas/Notas/Orden de Pago. No se reabrieron como fallos de esta regresión porque no rompieron el flujo principal validado y el alcance pidió documentarlos como pendientes/no aceptados.

Los riesgos más relevantes al cierre son:

- Alta: S2-10 no integrado; edición y auditoría ausentes; cancelación sin guardas de recepción/factura en `develop`.
- Alta: S2-09 incompleto dentro del flujo de OC.
- Alta: #82 sin paginación de 20 y con colisión de integración de migración.
- Alta: validación del importe de OP con notas seleccionadas, ya documentada en #87.
- Media/Baja: estructuras residuales de solicitudes, ficha/datos completos del proveedor, mensajes y detalles secundarios.
- Técnica: deudas de atomicidad/backfill/integridad documentadas en #84–#86.

## Retests y evidencia reutilizada

- S2-08: retest de los casos antes bloqueados.
- S2-09: retest de sus 8 casos.
- S2-10: ciclo actual de 10 casos sobre `develop`.
- S2-11/#89 y S2-14/#90: QA combinado y comprobación posterior a su integración.
- S2-12/#83: flujo parcial/total y stock documentado.
- QA-05: cierre E2E verificado por lectura sobre `develop` actual.
- #82 y #85: retests focalizados previos conservados.

## Datos QA creados en esta regresión

- OC #22 `QA-S2-10-CIERRE-1789105080032`, cancelada de forma controlada y sin impacto de stock.
- Movimiento `QA-QA07-1789105154882-IN`, ingreso de 1 unidad.
- Movimiento `QA-QA07-1789105154882-OUT`, egreso de 1 unidad.
- No se modificaron registros ajenos y no se realizó limpieza destructiva.

## Decisión

**Regresión: PASA.**

**Sprint 2 apto para cierre desde QA: SÍ CON PENDIENTES DOCUMENTADOS.** El núcleo integrado conserva Stock y completa el circuito principal de Compras. Las historias no aceptadas y PR externas no se consideran entregadas y quedan explícitamente fuera del cierre funcional aceptado.

