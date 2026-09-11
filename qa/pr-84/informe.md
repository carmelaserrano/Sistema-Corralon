# Informe QA rápido — PR #84 — S2-13 Factura de proveedor

Fecha: 2026-09-10 (America/Buenos_Aires)  
Rama: `feature/S2-13-factura-proveedor`  
Commit: `742184dd362779b125b87bc1dfa9db520ed995a2`  
Base: `origin/develop` — `7ae9bac0a2b5b76003c5cb4d1a344400523611fe`

## Resultado ejecutivo

El alta manual, normalización, control de duplicados, diferencias, vínculo con OC, saldo inicial, estados y filtros funcionaron. CA2 falla porque la implementación agrega **Importe Total** como campo obligatorio, aunque el criterio enumera como obligatorios únicamente Proveedor, Letra, Sucursal, Número y Fecha de emisión.

Además se detectaron dos riesgos técnicos: la migración no transforma comprobantes históricos antes de restringir la letra a A/B/C/M, y el vínculo a recepción se guarda después de la cabecera sin una transacción común.

**Resultado final: REQUEST CHANGES**

## Estado del repositorio

- `git fetch --all --prune`: correcto.
- PR contra `origin/develop`: **0 commits detrás / 2 delante**.
- Conflictos potenciales: no detectados.
- Cambio de rama: seguro y completado.
- Working tree local preservado: `.gitignore`, `package.json`, `package-lock.json`, `vite.config.js`, `playwright.config.js`, `e2e/` y evidencias `qa/`.
- Verificación por SHA-256 de 50 archivos QA/locales: 0 faltantes, 0 modificados por el cambio de rama.
- `.env.qa.local`: presente e ignorado mediante `.env.*`; no se expusieron credenciales.
- Sin commit, push, cambios de código ni ejecución de migraciones.

## Revisión técnica focalizada

Archivos revisados:

- `src/App.jsx`
- `src/components/layout/navigation.js`
- `src/index.css`
- `src/modules/tesoreria/api/facturasProveedorApi.js`
- `src/modules/tesoreria/api/facturasProveedorApi.test.js`
- `src/modules/tesoreria/pages/FacturasProveedorPage.jsx`
- `supabase/migrations/0022_factura_letra_sucursal.sql`

Resultados:

- Unique: correcto en `(proveedor_id, letra, sucursal, numero)`; el constraint existente conserva las columnas renombradas y el duplicado real fue rechazado.
- Mismo proveedor: los combos se filtran por proveedor y existen triggers para validar OC y recepción.
- Saldo inicial: el trigger heredado asignó correctamente `saldo_pendiente = importe_total`.
- Estados: se mapean `pendiente → Impaga`, `parcialmente_pagada → Pagada parcial` y `pagada → Pagada`.
- `git diff --check`: sin errores.
- Ambiente funcional: las columnas `letra`, `sucursal` y `orden_compra_id` estuvieron disponibles; no se aplicó ninguna migración durante el QA.
- Compatibilidad histórica: **riesgo detectado**. La migración elimina el check anterior y agrega A/B/C/M sin convertir filas válidas antiguas (`factura_a`, `factura_b`, etc.).
- Vínculo a recepción: **riesgo detectado**. La factura se inserta primero y la relación se inserta después; un fallo de la segunda operación deja la factura creada pero sin vínculo.

## Tests, lint y build

| Verificación | Resultado | Detalle |
|---|---|---|
| Tests facturas/tesorería | APROBADO | 1 archivo, 20 tests aprobados |
| Validador de migraciones | APROBADO | 22 nombres/números válidos |
| Lint | APROBADO | 0 errores; 1 warning preexistente en `AuthContext.jsx` |
| Build | APROBADO | 1670 módulos; warning no bloqueante por chunk de 533,19 kB |

No se ejecutó la suite completa por tratarse de un cambio acotado y no detectarse impacto transversal durante build/lint.

## Escenario Playwright

Se creó una única factura identificable:

- Comprobante QA: **M 0084-00846477**.
- ID: `a06c39a9-1db3-4718-9d08-939c7c53656a`.
- Proveedor: el mismo de la OC QA #6.
- OC vinculada: `76884f10-e168-4610-8adc-5f42c01307b1`.
- Emisión: 10/09/2026; vencimiento: 20/09/2026.
- Neto: 100; impuestos: 21; total: 130.
- Saldo pendiente inicial: 130; estado interno `pendiente`, mostrado como **Impaga**.

El conteo de facturas evolucionó 1 → 1 tras el primer intento con diferencia, 1 → 2 después de la confirmación explícita y permaneció en 2 después del intento duplicado. No se alteraron registros ajenos.

## Resultado por criterio

| CA | Estado | Evidencia |
|---|---|---|
| CA1 | **APROBADO** | La opción Nueva Factura abre un formulario manual y el comprobante QA se registró desde la interfaz. |
| CA2 | **FALLIDO** | Proveedor, Letra A/B/C/M, Sucursal, Número y Fecha son obligatorios, pero la UI/API agregan también Importe Total como obligatorio. |
| CA3 | **APROBADO** | Se guardaron vencimiento, neto 100, impuestos 21 y total 130 correctamente. |
| CA4 | **APROBADO** | Los combos mostraron solo OC/recepciones del proveedor seleccionado y la factura quedó vinculada a la OC QA #6. |
| CA5 | **APROBADO** | El segundo alta del mismo comprobante mostró exactamente `La factura ya fue registrada`; no creó otra fila. |
| CA6 | **APROBADO** | Sucursal `84` → `0084`; Número `846477` → `00846477`, tanto en UI como en persistencia. |
| CA7 | **APROBADO** | Neto + impuestos = 121 frente a total 130: informó diferencia de $9, no insertó y exigió pulsar `Confirmar y guardar igual`. |
| CA8 | **APROBADO** | La OC #6 totaliza $700 y la interfaz informó diferencia de -$570 respecto de la factura. |
| CA9 | **APROBADO** | La factura QA mostró saldo $130 e Impaga; una factura existente mostró saldo $0 y Pagada. `Pagada parcial` está disponible en el mapeo y filtro. |
| CA10 | **APROBADO** | Proveedor + rango 10/09/2026 + Impaga devolvió solo el comprobante QA esperado; el filtro Pagada devolvió el comprobante existente correspondiente. |

## Consola y red

- Excepciones JavaScript: 0.
- Requests fallidas a nivel transporte: 0.
- Respuestas inesperadas >=400: 0.
- Respuesta esperada: un HTTP 409 y su mensaje de consola al probar el duplicado; corresponde al escenario negativo de CA5.
- Defectos visuales evidentes: no observados.
- Screenshots: 0, según la restricción solicitada.

## Defectos

### D-01 — Importe Total es obligatorio fuera de la lista de CA2

- Severidad: **Media**.
- Descripción: el formulario y la API impiden registrar una factura sin total, aunque CA2 no lo incluye entre los obligatorios y CA3 lo presenta como dato que se puede cargar.
- Esperado: únicamente Proveedor, Letra, Sucursal, Número y Fecha de emisión obligatorios.
- Obtenido: `Importe Total *` tiene `required`; la API rechaza un total vacío o no positivo.
- Causa probable: decisión explícita de adaptar la historia al `NOT NULL` heredado del esquema 0013.
- Archivo probable: `FacturasProveedorPage.jsx:323-324` y `facturasProveedorApi.js:120-126`.

### D-02 — La migración puede fallar con facturas históricas válidas

- Severidad: **Alta**.
- Descripción: el esquema anterior admite `factura_a`, `factura_b`, `factura_c`, `factura_m` y `otro`. La migración renombra la columna, elimina el check anterior y agrega inmediatamente el check A/B/C/M sin actualizar datos existentes.
- Esperado: migración compatible con cualquier fila válida del esquema actual, transformando letras históricas o bloqueando con un diagnóstico previo controlado.
- Obtenido: una fila histórica con `factura_a` viola `chk_factura_letra`, por lo que `ALTER TABLE ... ADD CONSTRAINT` abortaría la migración.
- Causa probable: falta de un `UPDATE`/mapeo de valores entre el retiro del constraint viejo y la creación del nuevo.
- Archivo probable: `supabase/migrations/0022_factura_letra_sucursal.sql:19-35`.

### D-03 — Alta y vínculo a recepción no son atómicos

- Severidad: **Media**.
- Descripción: cuando se elige una recepción, primero se crea la factura y luego se inserta `factura_recepcion` mediante otra solicitud.
- Esperado: si se solicita el vínculo, factura y relación se guardan juntas o se revierten juntas.
- Obtenido: si falla el vínculo, la API informa que la factura ya fue registrada y deja una cabecera sin la relación solicitada; un reintento puede terminar en duplicado.
- Causa probable: dos inserts desde el cliente sin RPC/transacción común.
- Archivo probable: `src/modules/tesoreria/api/facturasProveedorApi.js:293-325`.

## Conclusión

**REQUEST CHANGES**

Motivos: incumplimiento de CA2, riesgo de despliegue de la migración con datos históricos y alta no atómica cuando se vincula una recepción. No se publicó review en GitHub.
