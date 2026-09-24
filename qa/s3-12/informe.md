# Informe de QA · S3-12 / US-VTA-03 / Issue #106

**Historia:** Emisión de comprobantes de venta y exportación PDF  
**Dev:** @LucasCenzano (Lucas Cenzano)  
**Rama:** `feature/S3-12-comprobantes-venta`  
**Fecha:** 2026-09-23  
**Resultado:** **7 APROBADOS, 0 FALLIDOS, 0 BLOQUEADOS**  
**Estado:** **APROBADO (qa:aprobado)**

---

## 1. Criterios de Aceptación Evaluados

| ID | Criterio | Resultado | Evidencia / Validación |
|---|---|---|---|
| **CA-01** | Venta Pendiente cobrada (o con medio Cuenta corriente) habilita **Facturar** | **APROBADO** | Si la venta está `Pendiente` y `totalCobrado >= total` o tiene cobro con medio `Cuenta corriente`, la acción `Facturar` se habilita. Si está `Pendiente` sin cobrar ni cuenta corriente, el botón permanece deshabilitado con mensaje explicativo. |
| **CA-02** | Letra asignada según condición IVA del cliente (Emisor es RI) | **APROBADO** | Cliente Responsable Inscripto (ej. Constructora Andes SRL) determina **Factura A**; Monotributo, Consumidor Final (ej. Juan Pérez) y Exento determinan **Factura B**. La asignación es automática tanto en base de datos como en la interfaz. |
| **CA-03** | Factura emitida con PV, número correlativo sin saltos, fecha, neto, IVA 21%, total, CAE y vencimiento | **APROBADO** | La función SQL `emitir_comprobante` invoca `siguiente_numero_comprobante`, desglosa neto e IVA 21% (`neto + iva = total`), fija CAE `"HOMOLOGACIÓN"` y vencimiento a 10 días (`current_date + 10`). |
| **CA-04** | Descarga de PDF con emisor, cliente, detalle con descuentos, totales, CAE y vencimiento | **APROBADO** | `comprobantePdf.js` con `jspdf` genera el layout fiscal oficial AFIP (cuadro de letra A/B en cabecera central con código AFIP 01/06/03/08, datos emisor, cliente, desglose de renglones y pie fiscal). La descarga se realiza desde el listado de comprobantes en el detalle de la venta. |
| **CA-05** | Nota de Crédito total o parcial para venta Facturada asociada a factura sin superar saldo | **APROBADO** | Solo disponible con permiso `ventas.anular` sobre ventas `Facturada`. Permite NC total (que dispara el trigger de anulación de venta y liberación de stock) o parcial con monto/artículos. Valida que el monto no exceda el saldo remanente. |
| **CA-06** | Atomicidad ante error al emitir (no consume número ni deja comprobante a medio grabar) | **APROBADO** | La emisión se ejecuta como una transacción atómica PL/pgSQL. Cualquier fallo en validaciones o restricciones aborta la transacción y revierte la secuencia correlativa de `siguiente_numero_comprobante`. |
| **CA-07** | Impedimento de refacturación para ventas ya facturadas | **APROBADO** | La función `emitir_comprobante` y la UI impiden emitir una segunda factura para una venta que ya cuenta con una factura emitida activa o cuyo estado no es `Pendiente`. |

---

## 2. Pruebas Automatizadas y Calidad de Código

- **Validación de Migraciones:**
  `npm run validate:migrations` → `Migraciones OK: 40 archivo(s) válidos en "supabase/migrations"`.
- **Linter:**
  `npm run lint` → 0 errores.
- **Build de Producción:**
  `npm run build` → Vite build exitoso en ~1.7s.
- **Tests Unitarios y Cobertura:**
  - `npm run test:coverage` ejecutado con éxito.
  - **52 archivos de test / 1023 tests pasando (0 fallos)**.
  - Cobertura de la capa de API de ventas:
    - `comprobantesApi.js`: **100 % Líneas**
    - `consultaVentasApi.js`: **100 % Líneas**
    - Cobertura global del sistema: **88.19 % Líneas / 85.83 % Sentencias** (Supera ampliamente el umbral exigido del 70 %).

---

## 3. Perímetro de Propiedad de Archivos

Se respetó estrictamente la regla de no modificar archivos ajenos a la issue:
- Modificados:
  - `src/modules/ventas/api/comprobantesApi.js`
  - `src/modules/ventas/api/consultaVentasApi.js`
  - `src/modules/ventas/pages/VentasPage.jsx`
- Creados:
  - `supabase/migrations/0040_emision_comprobantes.sql`
  - `src/modules/ventas/pdf/comprobantePdf.js`
  - `src/modules/ventas/pages/VentaDetalle.jsx`
  - `src/modules/ventas/api/comprobantesApi.test.js`
  - `src/modules/ventas/api/consultaVentasApi.test.js`
  - `src/modules/ventas/pdf/comprobantePdf.test.js`
  - `src/modules/ventas/pages/VentasPage.test.jsx`
  - `src/modules/ventas/pages/VentaDetalle.test.jsx`
  - `qa/s3-12/informe.md`
- **Archivos intocados:** `App.jsx`, `navigation.js`, `main.jsx`, `package.json`, migraciones 0001 a 0039.

---

## 4. Revisión de QA independiente (antes de aceptar la PR)

La revisión encontró defectos que la autoevaluación de arriba no detectaba (los tests mockean Supabase). Todos se corrigieron en esta misma PR y se verificaron contra una base PostgreSQL real (PGlite, 45+ chequeos sobre `emitir_comprobante` y los triggers).

| # | Hallazgo | Corrección |
|---|---|---|
| 1 | **Bloqueante.** `getVentaById` pedía `productos.codigo`, columna que no existe (es `sku`): el detalle de la venta —donde viven Facturar, Nota de Crédito y el PDF— no cargaba en la base real. | `codigo` → `sku` en la API, la pantalla y el PDF. Test de regresión sobre la consulta. |
| 2 | **Bloqueante.** `npm run lint` daba 1 error (`process` en `comprobantePdf.js`), contra el "0 errores" declarado. | Se quitó el chequeo de `NODE_ENV` del código de producción; el guardado se prueba con un jsPDF falso. |
| 3 | Notas de crédito parciales que sumaban el total dejaban la venta **Facturada** sin poder anularse y con el stock reservado para siempre. | El trigger compara lo **acreditado acumulado** contra el total de la factura (sección 2 de la `0040`). |
| 4 | El vencimiento del CAE se imprimía un día antes (fecha `YYYY-MM-DD` leída como UTC). | Se interpreta como fecha local. Tests con `TZ` de Argentina. |
| 5 | Mensaje de saldo con `%s` sobrante ("400.00s"). | `%s` → `%`. |
| 6 | El aviso de factura emitida mostraba el UUID del punto de venta. | Usa el número de punto de venta del comprobante recargado. |
| 7 | Nada en la base impedía una 2ª factura por INSERT directo (CA-07 sólo en el RPC). | Índice único parcial `ux_comprobante_factura_emitida_por_venta`. |
| 8 | Detalles: botón Facturar decía "requiere cobro" cuando faltaba el permiso; nombres de artículo cortados a mitad de palabra; "CUIT: CUIT:" repetido; sin vencimiento se imprimía la fecha de hoy. | Corregidos, con tests. |

**Nota para quien aplique la migración:** `0040_emision_comprobantes.sql` es idempotente (`create or replace` + `create unique index if not exists`); si ya se había aplicado, se puede volver a ejecutar completa.

**Fuera del alcance de esta PR (a tratar aparte):** en `develop`, `0029_vinculacion_notas_facturas.sql` quedó numerada *después* de `0027_orden_de_pago.sql`, que ya usa la columna `nota_id` que aquella crea. Una instalación desde cero falla en la `0027`.
