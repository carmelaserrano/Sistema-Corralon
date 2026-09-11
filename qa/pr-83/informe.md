# Informe QA — PR #83 — S2-12 Recepción de mercadería vinculada a OC

Fecha: 2026-09-10 (America/Buenos_Aires)  
Rama evaluada: `feature/S2-12-recepcion-mercaderia`  
Commit evaluado: `6cb17db5c9f21848703433504373815d5a7fb221`  
Base: `origin/develop` en `7ae9bac0a2b5b76003c5cb4d1a344400523611fe`

## Resultado ejecutivo

La recepción parcial y total funciona de extremo a extremo, actualiza stock y OC, genera movimientos y no crea facturas. La protección contra cantidades inválidas, exceso y re-recepción también funcionó. Se detectó un incumplimiento literal de CA7: la interfaz muestra `Debe recibir al menos un producto para confirmar.` en lugar del texto exacto solicitado `Debe recibir al menos un producto`.

**Recomendación final: REQUEST CHANGES**

## Sincronización y seguridad del workspace

- `git fetch --all`: ejecutado correctamente.
- Diferencia contra `origin/develop`: **0 commits detrás / 3 commits delante**.
- Conflictos potenciales: no detectados por `git merge-tree`.
- Cambio a la rama de la PR: seguro y completado.
- Working tree local preservado: `.gitignore`, `package.json`, `package-lock.json`, `vite.config.js`, `playwright.config.js`, `e2e/` y `qa/` continúan presentes.
- Se compararon 49 archivos locales de QA antes y después del cambio de rama: 0 faltantes y 0 hashes modificados.
- `.env.qa.local`: presente e ignorado por `.gitignore` mediante `.env.*`. No se expuso su contenido.
- No se hizo commit ni push. No se modificó código funcional. No se ejecutaron migraciones ni cambios de esquema.

## Resumen técnico

Se revisaron los 11 archivos modificados por la PR, con foco en migración, RPC, API, páginas, tests y navegación.

- La migración elimina `remito_proveedor` y la aplicación no conserva referencias funcionales al campo.
- El alta se realiza mediante una única RPC `registrar_recepcion_oc`, con validación de permiso, bloqueo de OC y renglones, control de cantidades, alta de recepción, movimiento, stock y actualización de OC dentro de la misma transacción.
- La RPC no inserta en `facturas_proveedor` ni en tablas de relación de facturas.
- La recepción confirmada queda protegida por revocación de escritura directa y triggers de inmutabilidad en cabecera y detalle.
- La RPC admite únicamente OC `pendiente` o `parcialmente_recibida`; el selector aplica el mismo filtro.
- La recepción no depende funcionalmente de solicitudes de reposición.
- La migración resultó compatible con el esquema observado en el ambiente funcional: la RPC y las columnas nuevas estuvieron disponibles sin aplicar cambios durante este QA.
- `git diff --check`: sin errores.
- `npm run validate:migrations`: 22 migraciones válidas.

Limitación de verificación aislada: `scripts/probar-recepcion-oc.mjs` no pudo ejecutarse porque su dependencia PGlite vive en `.temp/recepcion-db`, no está declarada en el proyecto ni instalada. No se agregó la dependencia. La atomicidad se verificó por inspección de la única RPC y por consistencia del resultado E2E, pero no se realizó inyección local de una falla intermedia.

## Tests, lint y build

| Verificación | Resultado | Detalle |
|---|---|---|
| Tests relacionados | APROBADO | 2 archivos, 39 tests aprobados |
| Suite completa Vitest | APROBADO | 25 archivos, 421 tests aprobados |
| Validador de migraciones | APROBADO | 22 archivos válidos |
| Lint | APROBADO | 0 errores, 1 warning preexistente en `src/lib/AuthContext.jsx` |
| Build | APROBADO | Vite completó 1669 módulos; warning no bloqueante por chunk >500 kB |
| Prueba SQL PGlite | BLOQUEADO | dependencia local no instalada; no se agregaron dependencias ni se corrieron migraciones |

El primer lint, ejecutado en paralelo con build, recibió un `ENOENT` sobre un archivo temporal de Vite. Repetido de forma aislada, finalizó correctamente; se clasifica como interferencia de ejecución y no como defecto de la PR.

## Datos QA creados

Se creó únicamente el escenario mínimo y se identificó con observaciones:

- OC QA: **#6**, ID `76884f10-e168-4610-8adc-5f42c01307b1`.
- Etiqueta: `QA PR83 2026-09-10T04:38:51.436Z`.
- Productos: `ART-000005` por 3 unidades y `ART-000004` por 2 unidades.
- Depósito de la OC: Sucursal Centro.
- Recepción parcial: **N.º 4**, 1+1 unidades en Sucursal Norte.
- Recepción final: **N.º 5**, saldo 2+1 en Sucursal Centro.

No se eliminaron estos datos para preservar trazabilidad. No se alteraron proveedores, productos, depósitos ni registros ajenos al escenario.

## Resultado por criterio de aceptación

| CA | Estado | Evidencia |
|---|---|---|
| CA1 | **APROBADO** | El selector mostró solo OC Pendiente/Parcial. La OC #6 apareció como Pendiente y luego Parcial; al quedar Recibida desapareció. Una llamada controlada posterior fue rechazada con `RC003` y no creó recepción. |
| CA2 | **APROBADO** | No existe campo ni texto de remito en la interfaz. La migración elimina `remito_proveedor` y la API no lo envía. |
| CA3 | **APROBADO** | La OC #6 precargó 3 y 2; tras la parcial precargó exactamente los saldos 2 y 1. |
| CA4 | **APROBADO** | Precargó Sucursal Centro, permitió cambiar a Sucursal Norte para la parcial y volvió a tomar Centro por defecto en la segunda recepción. |
| CA5 | **APROBADO** | Se confirmó una parcial 1+1 y luego el total restante 2+1. El formulario y la RPC rechazaron superar el pendiente. |
| CA6 | **APROBADO** | Para un renglón con pendiente 2 mostró `Cantidad máxima admitida para Cemento: 2` y deshabilitó confirmar. |
| CA7 | **FALLIDO** | Todo en cero impidió confirmar, pero mostró `Debe recibir al menos un producto para confirmar.` en vez del texto exacto requerido. |
| CA8 | **APROBADO** | Recepciones 4 y 5 quedaron Confirmadas, con números distintos, fecha/hora y usuario. El detalle no ofrece editar/eliminar y existen protecciones SQL de cabecera y detalle. |
| CA9 | **APROBADO** | Parcial en Norte: stock 0→1 para ambos productos y dos detalles de movimiento por 1. Final en Centro: stock 4→6 y 14→15, con detalles de movimiento por 2 y 1. |
| CA10 | **APROBADO** | Tras la primera recepción: OC `parcialmente_recibida`, recibido 1/3 y 1/2. Tras la segunda: OC `recibida`, recibido 3/3 y 2/2. |
| CA11 | **APROBADO** | Conteo de facturas permaneció 1→1 durante ambas recepciones; 0 vínculos en `factura_recepcion` para las recepciones 4 y 5. |

## Validaciones adicionales

- Cantidades enteras: **APROBADO**. `1.5` fue rechazado con `La cantidad debe ser un número entero mayor o igual a cero`.
- OC Recibida no recepcionable: **APROBADO**. Ausente del selector y rechazo servidor `RC003`.
- Inmutabilidad: **APROBADO** por UI y revisión técnica de permisos/triggers. No se realizaron escrituras destructivas sobre la evidencia QA.
- Atomicidad: **APROBADO por diseño e integración**, con la limitación de no haber ejecutado el test de rollback por falla inducida del arnés PGlite.
- Consola y red: **APROBADO**. 0 `console.error`, 0 excepciones JS, 0 requests fallidas y 0 respuestas HTTP >=400 en los flujos normales. El `RC003` fue una prueba negativa directa y esperada.
- Errores visuales evidentes: no observados.
- Screenshots: no generados; no apareció un defecto visual que los justificara.

## Defectos encontrados

### D-01 — Texto de validación CA7 no coincide con el requerido

- Severidad: **Baja**.
- Criterio: CA7.
- Pasos:
  1. Ingresar a Recepciones.
  2. Seleccionar una OC Pendiente o Parcial.
  3. Cambiar todos los renglones a 0.
- Esperado: se impide confirmar y se muestra exactamente `Debe recibir al menos un producto`.
- Obtenido: se impide confirmar, pero se muestra `Debe recibir al menos un producto para confirmar.`.
- Evidencia: texto del DOM capturado por Playwright; botón Confirmar deshabilitado.
- Responsable probable: `src/modules/stock/pages/RecepcionesPage.jsx`, líneas 161 y 385. El test de página consolida el texto divergente en la línea 423.

### D-02 — Prueba transaccional SQL no integrada ni reproducible con las dependencias del proyecto

- Severidad: **Media (calidad/automatización)**.
- Descripción: el script que prueba rollback, inmutabilidad, permisos y transición completa importa PGlite desde una carpeta temporal local no versionada.
- Pasos:
  1. Usar un checkout con las dependencias declaradas instaladas.
  2. Ejecutar `node scripts/probar-recepcion-oc.mjs`.
- Esperado: la prueba crítica de base puede ejecutarse con la instalación normal del proyecto y/o desde CI.
- Obtenido: falta `.temp/recepcion-db/node_modules/@electric-sql/pglite`; el script exige una instalación manual no declarada y no está incluido en los scripts de test.
- Evidencia técnica: import fijo en `scripts/probar-recepcion-oc.mjs:3`; PGlite no figura en `package.json` ni el script en el flujo `npm test`.
- Responsable probable: `scripts/probar-recepcion-oc.mjs` y configuración de tests/CI.

## Casos a actualizar en la matriz QA #61

No se modificó el Excel. Según esta ejecución, deberían actualizarse los casos S2-12 con estos resultados:

| Caso sugerido | Resultado |
|---|---|
| S2-12-01 — Elegibilidad de OC Pendiente/Parcial y exclusión de Recibida | APROBADO |
| S2-12-02 — Ausencia de remito del proveedor | APROBADO |
| S2-12-03 — Precarga de productos y saldo pendiente | APROBADO |
| S2-12-04 — Depósito por defecto y cambio de destino | APROBADO |
| S2-12-05 — Recepción parcial y total sin exceder pendiente | APROBADO |
| S2-12-06 — Mensaje con cantidad máxima admitida | APROBADO |
| S2-12-07 — Bloqueo con todos los renglones en cero y texto exacto | FALLIDO |
| S2-12-08 — Confirmación, numeración, auditoría e inmutabilidad | APROBADO |
| S2-12-09 — Movimiento de ingreso y actualización de stock por producto | APROBADO |
| S2-12-10 — Cantidad recibida y estados Pendiente/Parcial/Recibida | APROBADO |
| S2-12-11 — No generación de factura | APROBADO |
| S2-12-A01 — Rechazo de cantidades decimales/inválidas | APROBADO |
| S2-12-A02 — Rechazo servidor al reintentar OC Recibida | APROBADO |
| S2-12-A03 — Rollback ante falla intermedia | BLOQUEADO en arnés local; cubierto solo por revisión técnica en esta ejecución |
| S2-12-A04 — Consola, excepciones y red | APROBADO |

## Conclusión

**REQUEST CHANGES** por el incumplimiento literal de CA7 y por la falta de integración reproducible del test transaccional crítico. No se publicó ninguna review en GitHub.
