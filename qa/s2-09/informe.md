# QA S2-09 / US-CMP-03 / Issue #52

## Retest rápido de los 8 casos anteriormente bloqueados — 2026-09-10

Rama: `develop`. HEAD: `1126fd328d895933c8474c957f6c61368bcb8265` (igual a `origin/develop`).

Resultado del retest: **1 APROBADO, 6 FALLIDOS, 1 BLOQUEADO**.

| ID | Resultado retest | Evidencia obtenida |
|---|---|---|
| TC-CMP-03-01 | FALLIDO | El proveedor es visible en la OC, pero sólo mediante un `select`; no hay búsqueda por Razón Social/CUIT ni filtro visible. |
| TC-CMP-03-02 | FALLIDO | Al seleccionar proveedor no aparece el panel requerido: faltan Condición Fiscal, Rubro/s N:M, contacto principal, teléfono y email. |
| TC-CMP-03-03 | FALLIDO | El atributo HTML `required` impide guardar sin proveedor, pero no aparece el mensaje requerido `Debe seleccionar un proveedor`; Chromium informa `Please select an item in the list.` |
| TC-CMP-03-04 | FALLIDO | Con productos y precios cargados, cambiar de proveedor no muestra advertencia, cambia inmediatamente el proveedor y conserva los renglones/precios. |
| TC-CMP-03-05 | FALLIDO | Al no existir confirmación, tampoco se puede cancelar el cambio para conservar explícitamente el proveedor original. |
| TC-CMP-03-06 | FALLIDO | No existe la acción `Ver ficha completa` dentro de la OC. |
| TC-CMP-03-07 | BLOQUEADO | No se desactivó ningún proveedor existente: no había un proveedor QA descartable y controlado para ejecutar esa transición sin afectar datos ajenos. |
| TC-CMP-03-08 | APROBADO | La OC QA `#7` persistió correctamente `proveedor_id = b3a7c816-25af-4256-b5c7-1643488fef1c`. |

El selector mostró una sola opción por proveedor, sin duplicaciones visibles. No había un proveedor con múltiples rubros en los datos QA actuales para cubrir ese extremo; además, la pantalla no muestra rubros en absoluto, por lo que `TC-CMP-03-02` falla de forma concluyente.

### Defectos del retest

- **D-R09-01 — Falta búsqueda/filtro de proveedores en la OC. Severidad: Media.** Causa probable: `OrdenesCompraPage.jsx` renderiza directamente el arreglo en un `select`.
- **D-R09-02 — Falta el panel de datos y Rubro/s N:M del proveedor. Severidad: Alta.** Causa probable: la pantalla sólo usa `razon_social` y `cuit`; `getProveedores()` además normaliza la relación N:M a un único `rubro`.
- **D-R09-03 — Mensaje requerido de proveedor ausente. Severidad: Baja.** Se delega la validación al mensaje nativo del navegador en lugar de mostrar `Debe seleccionar un proveedor`.
- **D-R09-04 — Cambio de proveedor sin advertencia ni confirmación. Severidad: Alta.** El `onChange` actual reemplaza el ID inmediatamente y conserva productos/precios; no existe camino para cancelar el cambio.
- **D-R09-05 — Falta `Ver ficha completa`. Severidad: Media.** No hay control ni navegación desde la OC hacia la ficha del proveedor.

No se registraron `console.error`, excepciones JavaScript ni respuestas HTTP fallidas relevantes. No se generaron capturas. No se ejecutaron suites, migraciones, commit ni push; no se modificó código funcional. La única alta fue la OC QA `#7`, luego anulada de forma controlada; no se alteraron datos ajenos.

---

## Ejecución original — 2026-09-06

Fecha: 2026-09-06. Rama verificada: develop. HEAD: b992dcd933b49e0385ad21d895a9b92dcc1ab5b5.
URL: http://localhost:5173/.

## Resumen

- APROBADOS: 0
- FALLIDOS: 0
- BLOQUEADOS: 8

## B-02 — S2-08 no disponible en la versión examinada

S2-09 depende de la pantalla de Orden de Compra de S2-08. La lectura actual de src/App.jsx y src/components/layout/navigation.js confirma que no hay pantalla ni navegación de generación de OC. El inventario de src tampoco incluye un módulo de compras. Las referencias a orden_compra_id en Recepciones pertenecen al módulo de recepción, no a generación de OC.

Existe getProveedoresSeleccionables en proveedoresApi.js, que solicita estado activo, pero su existencia no acredita la búsqueda ni la integración dentro de una OC. No se marca ningún caso APROBADO por inspección estática o por una prueba de la gestión independiente de proveedores.

Severidad sugerida del bloqueo: Alta, porque impide ejecutar toda la historia. Es un único bloqueo de dependencia, no ocho defectos. No se identificaron defectos funcionales reales nuevos ni se asignaron IDs D-04 o posteriores.

## Evidencia y método

- E1: [Código de pantalla y navegación examinado](frontend-source.txt), [inventario de src](archivos-src.txt), [referencias a OC](referencias-oc.txt), [revisión](revision.txt), [función existente de proveedores](proveedores-seleccionables.txt).
- E2: [Captura actual de localhost](localhost.png) y [resultado de navegador](browser.json), tomados en esta ejecución (2026-09-06T22:15:42Z).
- [Automatización reutilizada](browser-check.mjs): Edge headless mediante CDP y WebSocket nativo de Node, sin dependencias nuevas. Comando ejecutado: node qa/s2-09/browser-check.mjs. Requiere Edge aislado en puerto de depuración 9227 y Vite en 5173; cierra ese navegador al terminar.

El navegador aislado cargó el login sin excepciones JavaScript capturadas. No hubo sesión autenticada; la captura solo acredita disponibilidad del login. La ausencia de la pantalla de OC se establece por lectura de código, no por la captura del login. No se eludió autenticación. Los ocho casos funcionales no pudieron ejecutarse al faltar su precondición común.

## Casos

| ID del caso | Resultado | Resultado obtenido | Evidencia | Defecto asociado | Severidad sugerida | Observaciones |
|---|---|---|---|---|---|---|
| TC-CMP-03-01 | BLOQUEADO | Búsqueda por Razón Social/CUIT y filtro Activos no ejecutables. | E1, E2 | B-02 (bloqueo común) | Alta para B-02 | La función getProveedoresSeleccionables no acredita integración en OC. |
| TC-CMP-03-02 | BLOQUEADO | Panel de datos de proveedor no disponible dentro de OC. | E1, E2 | B-02 (bloqueo común) | Alta para B-02 | Pendientes Razón Social, CUIT, Condición Fiscal, Rubro/s (N:M), contacto principal, teléfono y email; todos de solo lectura. |
| TC-CMP-03-03 | BLOQUEADO | No se pudo intentar generar una OC sin proveedor. | E1, E2 | B-02 (bloqueo común) | Alta para B-02 | Mensaje «Debe seleccionar un proveedor» no verificado. |
| TC-CMP-03-04 | BLOQUEADO | No se pudo cargar productos/precios ni cambiar proveedor en una OC. | E1, E2 | B-02 (bloqueo común) | Alta para B-02 | Advertencia y confirmación de limpieza de precios no verificadas. |
| TC-CMP-03-05 | BLOQUEADO | No se pudo cancelar el cambio de proveedor. | E1, E2 | B-02 (bloqueo común) | Alta para B-02 | Conservación del proveedor original y precios no verificada. |
| TC-CMP-03-06 | BLOQUEADO | No se pudo usar «Ver ficha completa» desde una OC. | E1, E2 | B-02 (bloqueo común) | Alta para B-02 | Navegación y conservación de datos al volver no verificadas. |
| TC-CMP-03-07 | BLOQUEADO | No se pudo seleccionar proveedor y confirmar una OC tras su desactivación. | E1, E2 | B-02 (bloqueo común) | Alta para B-02 | No se desactivaron proveedores; validación de habilitación no ejecutada. |
| TC-CMP-03-08 | BLOQUEADO | No se pudo crear una OC para verificar proveedor_id persistido. | E1, E2 | B-02 (bloqueo común) | Alta para B-02 | No se generaron registros ni se sustituyó la prueba por inspección de columnas. |

## Alcance y próximo requisito

No se corrigieron defectos ni se modificaron lógica, Supabase, migraciones o datos. No se crearon OCs ni se desactivaron proveedores. Sin commit, push o cambio de rama. Se preservó package-lock.json previamente modificado y la evidencia S2-08. Solo se agregaron archivos de QA en qa/s2-09/.

Para reejecutar: disponer de S2-08 y su integración S2-09 en develop, más una sesión/usuario de QA habilitado. TC-CMP-03-07 deberá usar un proveedor de prueba controlado para evitar afectar proveedores operativos. Rubro/s se interpretará como relación N:M, conforme a la definición indicada por el usuario.
