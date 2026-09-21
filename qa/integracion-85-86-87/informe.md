# QA integral rápido — PR #85 + #86 + #87

Fecha: 2026-09-10 (America/Buenos_Aires)  
Rama: `feature/S2-15-orden-de-pago`  
Commit: `73e7c3d326997ad60884d476f56ccadd78c7a27a`  
Base: `origin/develop` — `d3dbbdf1c931094119a40b7c2afa63285048be92`

## Preparación

- `git fetch --all --prune`: correcto.
- La punta #87 está 0 commits detrás / 10 delante de `origin/develop`.
- Cadena confirmada por ascendencia Git: #85 incluida en #86; #86 incluida en #87.
- Rama local creada siguiendo exactamente `origin/feature/S2-15-orden-de-pago`.
- Sin conflictos ni archivos solapados con cambios locales.
- `.env.qa.local`, `playwright.config.js`, 2 archivos E2E y 44 evidencias QA preservados. Las dos rutas inicialmente reportadas como faltantes se verificaron presentes; fue una lectura incorrecta de UTF-8 en el manifiesto temporal.
- No se hizo commit, push, merge ni publicación en GitHub.
- No se aplicaron migraciones ni se cambió el esquema.
- No se generaron screenshots.

## Cadena funcional confirmada

| Historia | Commits exclusivos sobre la anterior | Migración |
|---|---:|---|
| #85 / S2-16 | 4 | `0024_notas_proveedor.sql` |
| #86 / S2-17 | 3 | `0025_vinculacion_notas_facturas.sql` |
| #87 / S2-15 | 3 | `0026_orden_de_pago.sql` |

## Datos QA utilizados

Proveedor: `Corralon Norte S.A`, id `b3a7c816-25af-4256-b5c7-1643488fef1c`.

| Dato | Identificador | Importe | Uso/estado final |
|---|---|---:|---|
| Factura QA existente | `M 0084-00846477` | 130 | Pagada, saldo 0 |
| Crédito principal | `A 8587-00008501` | 30 | Aplicada parcial por 20; saldo 10 |
| Débito principal | `M 8587-00008502` | 10 | Aplicada por 10 |
| Débito de orden | `B 8587-00008503` | 10 | Aplicada por orden #3 |
| Crédito de orden | `C 8587-00008504` | 10 | Aplicada por orden #3 |
| Orden de pago | `#3`, referencia `QA-8587-INTEGRAL` | 120 | Confirmada |

No se alteraron registros ajenos al QA. Las filas se conservaron para trazabilidad.

## Flujo ejecutado y saldos

| Paso | Factura | Crédito A | Débito M | Observación |
|---|---:|---:|---:|---|
| Inicial | 130 | — | — | Factura Pendiente |
| Crear crédito sin factura | 130 | 30 disponible | — | Disponible, saldo completo |
| Vincular crédito 20 | 110 | 10 | — | Ambos quedan parciales |
| Desvincular crédito | 130 | 30 | — | Restitución completa y auditada |
| Revincular crédito 20 | 110 | 10 | — | Nueva imputación activa |
| Crear débito vinculado 10 | 120 | 10 | 0 | Débito suma 10 |
| Desvincular débito | 110 | 10 | 10 | Restitución correcta |
| Revincular débito 10 | 120 | 10 | 0 | Débito vuelve a sumar 10 |

Antes de pagar: `130 − 20 + 10 = 120`.

Para la orden positiva se agregaron Crédito C 10 y Débito B 10, ambos Disponibles:

`subtotal 120 − crédito 10 + débito 10 = total a pagar 120`.

Orden #3:

- Importe efectivo: 120.
- Estado: Confirmada.
- Factura final: saldo 0, Pagada.
- Crédito C y Débito B: saldo 0, Aplicada.
- `pago_origen_id`: presente en ambas imputaciones de notas.
- Imputación de efectivo: 120.
- Historial y detalle: muestran número, fecha, proveedor, medio, factura y notas.
- Update: rechazado con `OP007`; DELETE afectó 0 filas.

Cuenta corriente final del proveedor: **−10**, consistente con el crédito principal todavía disponible por 10. Crédito figura en debe, débito/factura en haber y pago en debe.

## Resultado E2E

**FALLIDO.** El camino balanceado confirmó correctamente, pero un caso normal con efecto neto de notas distinto de cero no puede confirmarse de manera coherente.

Reproducción principal:

1. Factura con saldo 120.
2. Seleccionar crédito Disponible por 10.
3. UI muestra total a pagar 110.
4. Ingresar 110 deja Confirmar deshabilitado porque compara contra subtotal 120.
5. Ingresar 120 habilita el botón aunque contradice el total visible.

Adicionalmente, una nota parcialmente aplicada a la factura continúa apareciendo como candidata para esa misma factura; la RPC devuelve `ya está imputada a esa factura`. El rollback dejó 0 órdenes y saldos intactos.

## Consola y red

- Flujos válidos #85/#86: 0 console.error, 0 excepciones JS, 0 requests fallidas.
- Orden positiva: 0 console.error, 0 excepciones JS, 0 requests fallidas.
- Duplicado intencional: HTTP 409 esperado, mensaje funcional correcto.
- Dos intentos de orden defectuosos: HTTP 400; ambos sin mutaciones parciales.
- No hubo errores de relaciones PostgREST.

## Tests y build

| Verificación | Resultado |
|---|---|
| Tests notas/facturas/imputaciones/orden de pago | 4 archivos, 63/63 APROBADOS |
| Validador de migraciones | 26 archivos válidos por nombre/numeración |
| Lint | APROBADO: 0 errores, 1 warning preexistente |
| Build | APROBADO: 1676 módulos; warning de tamaño de chunk |
| Suite completa | No ejecutada por alcance |

## Principales defectos

| ID | PR | Severidad | Resumen |
|---|---|---|---|
| D-85-01 | #85 | Alta | Backfill histórico ejecuta conversiones contra checks viejos y `lpad` puede truncar comprobantes. |
| D-85-02 | #85 | Media | Alta de nota y vínculo automático son dos operaciones no atómicas. |
| D-86-01 | #86 | Media | Se ofrece nuevamente el mismo par nota-factura aunque el unique/RPC lo rechaza. |
| D-86-02 | #86 | Alta | Escritura directa en `imputaciones` evita reglas críticas de la RPC. |
| D-87-01 | #87 | Alta | UI/RPC validan importe contra subtotal e ignoran el neto de notas. |
| D-87-02 | #87 | Media | Orden ofrece nota residual no imputable a la factura elegida. |

## Decisión y orden de merge

- Seguro mergear ahora: **NO**.
- Orden técnico obligatorio después de corregir y revalidar: **#85 → #86 → #87**.
- No conviene mergear #86 o #87 antes de #85 porque sus migraciones y APIs dependen linealmente de la anterior.
- Antes del despliegue debe reconciliarse el historial de migraciones: el ambiente tiene la estructura 0024–0026, pero el texto observado de `eliminar_nota_proveedor` corresponde a una versión anterior a la punta actual.

## Resumen final

PR #85: REQUEST CHANGES.  
PR #86: REQUEST CHANGES.  
PR #87: REQUEST CHANGES.  
Integración #85+#86+#87: **E2E FALLIDO**.
