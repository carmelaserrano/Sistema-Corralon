# QA-05 E2E — Issue #63 — Compras

Fecha: 2026-09-10  
Rama: `develop`  
HEAD: `1126fd328d895933c8474c957f6c61368bcb8265`

- **PASA**
- **Paso exacto donde falla:** no aplica; los 15 pasos del circuito principal finalizaron correctamente.
- **Saldo inicial factura:** $100,00, estado Impaga.
- **Efecto nota:** Nota de Crédito por $10,00; el saldo bajó de $100,00 a $90,00 y la factura pasó a Pagada parcial.
- **Importe Orden de Pago:** $90,00.
- **Saldo final:** $0,00, estado Pagada.
- **Errores críticos encontrados:** ninguno. Sin `console.error`, excepciones JavaScript ni respuestas HTTP fallidas durante el flujo funcional.
- **Decisión:** **APROBADO CON OBSERVACIONES**.

## Trazabilidad QA

- Proveedor activo: `Corralon Norte S.A`.
- Orden de Compra directa: `#8`, total $100,00, un `Cemento Portland x50kg`, depósito `Sucursal Norte`.
- Recepción: `#6`, Confirmada; la OC pasó de Pendiente a Recibida.
- Stock: `Cemento Portland x50kg` en `Sucursal Norte` pasó de 10 a 11.
- Movimiento de ingreso: `85c0a698-ccb0-4d0e-8705-b96d1aeb8c09`, Confirmado por una unidad.
- Factura: `A 6305-61408597`, vinculada a OC `#8` y recepción `#6`.
- Nota de Crédito: `A 6305-61408598`, importe $10,00, Aplicada a la factura.
- Orden de Pago: `#4`, Transferencia bancaria, referencia `QA-05-1789061408597`, estado Confirmada.
- Historial/cuenta corriente: el detalle de la OP muestra la factura y $90,00; el detalle de factura muestra saldo $0,00, estado Pagada y la NC por $10,00. En base quedaron dos imputaciones activas: NC $10,00 y pago $90,00.

Las observaciones técnicas y de UI previamente documentadas no rompieron este recorrido principal y no se trataron como bloqueantes, de acuerdo con el alcance indicado.

No se ejecutaron suites, migraciones, commit ni push. No se modificó código ni Excel. No se generaron screenshots.
