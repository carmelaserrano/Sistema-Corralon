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
  - **51 archivos de test / 1010 tests pasando (0 fallos)**.
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
