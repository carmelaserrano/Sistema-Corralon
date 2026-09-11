# QA S2-08 / US-CMP-02 / Issue #51

## Retest rápido de casos anteriormente bloqueados — 2026-09-10

Rama: `develop`. HEAD: `1126fd328d895933c8474c957f6c61368bcb8265` (igual a `origin/develop`).

Alcance ejecutado: exclusivamente `TC-CMP-02-01` a `TC-CMP-02-11`, antes bloqueados por ausencia del flujo de Orden de Compra. Los tres casos estructurales ya fallidos (`TC-CMP-02-12` a `TC-CMP-02-14`) no se repitieron, por indicación expresa.

Resultado del retest: **10 APROBADOS, 1 FALLIDO, 0 BLOQUEADOS**.

| ID | Resultado retest | Evidencia obtenida |
|---|---|---|
| TC-CMP-02-01 | APROBADO | Se abrió `Nueva Orden de Compra` directamente, con cabecera y detalle, sin solicitar una solicitud de reposición. |
| TC-CMP-02-02 | APROBADO | El selector mostró los 4 proveedores activos existentes y ningún proveedor fuera de ese conjunto. |
| TC-CMP-02-03 | APROBADO | Flujo disponible con Proveedor, Depósito destino, Condición de pago, Fecha de emisión, Entrega estimada y Observaciones. |
| TC-CMP-02-04 | APROBADO | Se agregaron dos artículos distintos con sus cantidades y precios. |
| TC-CMP-02-05 | APROBADO | Para 2 × $123,45 se calcularon subtotal y total de $246,90; la OC final totalizó $396,90. |
| TC-CMP-02-06 | FALLIDO | Tras agregar un artículo, la UI lo elimina del selector. No es posible volver a elegirlo para acumular cantidades. |
| TC-CMP-02-07 | APROBADO | Cantidades `0` y `-2` fueron rechazadas con `La cantidad debe ser mayor a 0`. |
| TC-CMP-02-08 | APROBADO | Precio negativo rechazado con `El precio debe ser mayor a 0`. |
| TC-CMP-02-09 | APROBADO | Una OC sin renglones fue rechazada con `La orden debe tener al menos un artículo`. |
| TC-CMP-02-10 | APROBADO | Se generó la OC QA `#7`, quedó inicialmente `pendiente`, apareció en el listado y abrió su detalle. |
| TC-CMP-02-11 | APROBADO | Se verificaron en base cabecera, proveedor, depósito, dos detalles, cantidades, precios, total, `created_by` y `created_at`. |

### Estados y anulación

La OC QA `#7` (`396d90dc-a1aa-4cdf-8e10-7c48f2dc489d`) fue anulada desde su detalle con el motivo identificable `QA RETEST S2-08 - anulacion controlada`. El estado final en base es `cancelada` y el motivo se muestra en pantalla. No se modificaron órdenes ajenas.

### Defecto del retest

**D-R08-01 — No se puede acumular cantidad del mismo artículo. Severidad: Media.**

- Pasos: crear una OC, agregar un artículo y abrir nuevamente el selector de artículos.
- Esperado: poder agregar nuevamente el mismo artículo y acumular su cantidad conforme al caso `TC-CMP-02-06`.
- Obtenido: el artículo desaparece del selector después del primer agregado.
- Causa probable: `articulosDisponibles` filtra todos los productos ya presentes en `items` en `src/modules/compras/pages/OrdenesCompraPage.jsx`.

Los defectos conocidos `D-01`, `D-02` y `D-03` sobre `solicitud_id`, `solicitud_detalle_id` y las tablas residuales de solicitudes permanecen documentados abajo y quedaron fuera de esta reejecución.

No se registraron `console.error`, excepciones JavaScript ni respuestas HTTP fallidas relevantes. No se generaron capturas. No se ejecutaron suites, migraciones, commit ni push; no se modificó código funcional.

---

## Ejecución original — 2026-09-06

Fecha: 2026-09-06. Rama: develop. HEAD: b992dcd933b49e0385ad21d895a9b92dcc1ab5b5.
URL: http://localhost:5173/. Proyecto: lfgzbazerzvxghhewvuv.

Resultado: 0 aprobados, 3 fallidos, 11 bloqueados.

B-01: La versión examinada no integra pantallas, navegación ni API de generación de órdenes de compra. La comprobación estática de App.jsx y navigation.js confirma la falta de acceso incluso tras autenticarse. El navegador aislado llegó al login sin excepciones JavaScript; no se proporcionaron credenciales y no se simuló ni eludió autenticación. No se atribuyen resultados funcionales a la inspección estática.

Herramienta: Edge headless + Chrome DevTools Protocol mediante WebSocket nativo de Node; sin dependencias nuevas. Ejecutado: node qa/s2-08/browser-check.mjs. Reejecución requiere Edge aislado con --remote-debugging-port=9227 y Vite en 5173. El script cierra el navegador de ese puerto al terminar.

E1: [Captura](localhost.png), [resultado del navegador](browser.json), [copia del código de navegación](frontend-source.txt).
E2: [Esquema real consultado](schema.json), obtenido con SELECT de information_schema.columns por Supabase MCP, sin escrituras.

Consulta: SELECT table_schema, table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('ordenes_compra','detalle_orden_compra','solicitudes_reposicion','detalle_solicitud_reposicion') ORDER BY table_name, ordinal_position;

| ID del caso | Resultado | Resultado obtenido | Evidencia | Defecto encontrado | Severidad sugerida | Observaciones |
|---|---|---|---|---|---|---|
| TC-CMP-02-01 | BLOQUEADO | No se puede abrir Nueva OC ni verificar el orden de campos. | E1 | B-01 | Alta | Pantalla ausente en esta versión. |
| TC-CMP-02-02 | BLOQUEADO | No hay selector de proveedores de OC para probar. | E1 | B-01 | Alta | No se verificó filtro Activo. |
| TC-CMP-02-03 | BLOQUEADO | No se puede inspeccionar un flujo de OC inexistente. | E1 | B-01 | Alta | Ausencia del módulo no acredita el caso. |
| TC-CMP-02-04 | BLOQUEADO | No se pudo agregar un producto. | E1 | B-01 | Alta | Sin formulario de OC. |
| TC-CMP-02-05 | BLOQUEADO | No se pudieron comprobar subtotal y total. | E1 | B-01 | Alta | Sin grilla de OC. |
| TC-CMP-02-06 | BLOQUEADO | No se pudo comprobar acumulación de cantidades. | E1 | B-01 | Alta | Sin grilla de OC. |
| TC-CMP-02-07 | BLOQUEADO | No se pudieron ingresar cantidades 0 y negativas. | E1 | B-01 | Alta | Rechazo no probado. |
| TC-CMP-02-08 | BLOQUEADO | No se pudo ingresar precio negativo. | E1 | B-01 | Alta | Rechazo no probado. |
| TC-CMP-02-09 | BLOQUEADO | No se pudo intentar guardar una OC vacía. | E1 | B-01 | Alta | Rechazo no probado. |
| TC-CMP-02-10 | BLOQUEADO | No se generaron OCs; numeración y estado no verificados. | E1 | B-01 | Alta | No se crearon datos. |
| TC-CMP-02-11 | BLOQUEADO | Persistencia y auditoría no verificadas funcionalmente. | E1 | B-01 | Alta | Existencia de columnas no acredita persistencia. |
| TC-CMP-02-12 | FALLIDO | Existe public.ordenes_compra.solicitud_id (uuid). | E2 | D-01 | Media | Consulta del esquema real. |
| TC-CMP-02-13 | FALLIDO | Existe public.detalle_orden_compra.solicitud_detalle_id (uuid). | E2 | D-02 | Media | Consulta del esquema real. |
| TC-CMP-02-14 | FALLIDO | Existen public.solicitudes_reposicion y public.detalle_solicitud_reposicion. | E2 | D-03 | Media | Consulta del esquema real. |

La severidad Alta de las filas bloqueadas corresponde al bloqueo B-01 compartido, no a once defectos funcionales demostrados. D-01, D-02 y D-03 incumplen los criterios técnicos indicados; su impacto funcional no se pudo medir. No se corrigieron defectos, no se modificaron datos, lógica, migraciones ni Supabase. Sin commit, push ni cambio de rama. Se preservó el cambio previo de package-lock.json.
