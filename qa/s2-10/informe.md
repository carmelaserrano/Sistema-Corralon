# QA S2-10 / US-CMP-07 / Issue #53

Fecha: 2026-09-11  
Rama evaluada: `develop`  
Commit: `67b5b227fcfd0282a0523d15ea504b39d00fe9b4`  
Resultado: **3 APROBADOS, 7 FALLIDOS, 0 BLOQUEADOS**  
Decisión: **REQUEST CHANGES / NO ACEPTADA**

## Contexto de integración

La implementación de S2-10 no está integrada en `develop`. La rama remota `feature/s2-10-modificacion-cancelacion-oc` está 4 commits delante y corresponde a la PR #91, todavía externa al código evaluado. Por indicación del cierre, los casos se ejecutaron exclusivamente sobre el `develop` actualizado, sin cambiar a esa rama ni integrar sus cambios.

## Diez casos ejecutados

| ID | Caso | Resultado | Evidencia |
|---|---|---|---|
| S2-10-01 | OC Pendiente habilita Modificar y Cancelar | **FALLIDO** | La OC QA #21 mostró `Anular`, pero no existe `Modificar`/`Editar`. |
| S2-10-02 | OC Parcial o Recibida deshabilita ambas acciones | **FALLIDO** | La OC Parcial #5 y la Recibida #9 mostraron `Anular` habilitado. |
| S2-10-03 | OC Cancelada no permite modificar/cancelar y muestra motivo | **APROBADO** | La OC Cancelada #10 sólo mostró `Volver` y el motivo de cancelación. |
| S2-10-04 | Modificar productos, cantidades y precios; persistir y recalcular total | **FALLIDO** | No existe flujo ni acción de edición en `develop`. |
| S2-10-05 | Auditoría de modificación: usuario, fecha y valores anterior/nuevo | **FALLIDO** | No existe consulta ni sección de historial de modificaciones; tampoco está integrada la migración correspondiente. |
| S2-10-06 | Bloquear cancelación con recepción confirmada y mostrar mensaje requerido | **FALLIDO** | La OC Parcial #5, con recepción #7 Confirmada, mantiene `Anular`; la API integrada actualiza directamente sin validar recepciones. No se envió la anulación para no corromper evidencia existente. |
| S2-10-07 | Cancelar OC Pendiente sin recepciones y excluirla de recepción | **APROBADO** | Se creó y canceló la OC QA #22. Quedó Cancelada y dejó de aparecer en el selector de Recepciones. |
| S2-10-08 | Motivo obligatorio | **APROBADO** | Aceptar el diálogo con motivo vacío no envió ningún PATCH y la OC permaneció Pendiente; con motivo válido se confirmó. |
| S2-10-09 | OC Cancelada muestra motivo, usuario y fecha | **FALLIDO** | Muestra el motivo, pero no el usuario ni la fecha de cancelación. |
| S2-10-10 | Bloquear cancelación con factura vinculada e informar comprobante | **FALLIDO** | La OC #8 tiene la factura `A 6305-61408597` y aun así muestra `Anular`; la API no consulta facturas ni devuelve el comprobante bloqueante. No se intentó modificar esa OC. |

## Datos QA y seguridad

- Alta controlada: OC #22, observación `QA-S2-10-CIERRE-1789105080032`.
- Cancelación controlada: motivo con el mismo identificador QA.
- La OC no tenía recepciones ni facturas.
- El snapshot de Stock anterior y posterior fue idéntico.
- No se alteraron órdenes ajenas ni se ejecutaron las anulaciones peligrosas ofrecidas sobre OC con recepciones/factura.
- Consola: 0 `console.error` o excepciones JavaScript.
- Red: 0 respuestas HTTP fallidas en el flujo ejecutado.
- No se generaron screenshots.

## Pruebas automatizadas

- `OrdenesCompraPage.test.jsx`: 6/6 aprobadas, pero no cubren edición ni los bloqueos de cancelación ausentes.
- Regresión focalizada compartida Stock/Compras/Tesorería: 12 archivos, 139/139 tests aprobados.
- No se ejecutó la suite completa.

## Defectos

### D-S210-01 — Modificación de OC no entregada en `develop`

- Severidad: Alta.
- Esperado: una OC Pendiente permite editar productos, cantidades y precios, persiste los cambios y recalcula el total.
- Obtenido: no existe acción ni flujo de edición.
- Causa probable: `OrdenesCompraPage.jsx` sólo implementa alta y detalle; `ordenesCompraApi.js` no exporta una operación de actualización.

### D-S210-02 — Cancelación sin guardas de estado, recepción o factura

- Severidad: Alta.
- Esperado: sólo una OC Pendiente sin recepciones confirmadas ni factura puede cancelarse; los rechazos deben indicar el motivo/comprobante.
- Obtenido: Parcial, Recibida y una OC con factura muestran `Anular`. La API hace un UPDATE directo sin verificar estado, recepciones ni facturas.
- Causa probable: condición UI `estado !== 'cancelada'` y ausencia de una RPC transaccional de cancelación con reglas de negocio.

### D-S210-03 — Auditoría de modificaciones ausente

- Severidad: Alta.
- Esperado: usuario, fecha/hora, campo, valor anterior y valor nuevo.
- Obtenido: no hay historial de modificaciones en API ni pantalla.
- Causa probable: las migraciones y componentes de la PR #91 no están integrados.

### D-S210-04 — Detalle de cancelación incompleto

- Severidad: Media.
- Esperado: motivo, usuario y fecha de cancelación visibles.
- Obtenido: sólo se muestra el motivo.
- Causa probable: el detalle no renderiza `cancelado_by` ni `cancelado_at`.

## Decisión

**REQUEST CHANGES**. S2-10 no puede aceptarse desde `develop`; la implementación pendiente deberá evaluarse en un ciclo separado cuando se integre o se autorice revisar la PR #91.

