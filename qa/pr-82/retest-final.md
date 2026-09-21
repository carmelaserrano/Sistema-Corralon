# Retest final — PR #82 / Consulta de proveedores

Fecha: 2026-09-10  
Rama: `s2-06-consultaProv`  
Commit: `7e105e42a0bb5e50b3e3403f4c641cd252069573`  
Comparación actual: 22 commits detrás y 1 delante de `origin/develop` (`1126fd328d895933c8474c957f6c61368bcb8265`)

## Alcance

Se retestearon únicamente los puntos pedidos. Las búsquedas y filtros se ejecutaron con el RPC real desde Playwright autenticado. Para superar los 20 registros y representar un proveedor con dos rubros se interceptó solamente la respuesta de lectura con datos sintéticos en el navegador: no se crearon ni modificaron proveedores en Supabase.

No se hicieron commit, push, merge, cambios de código ni migraciones. Se preservaron `.env.qa.local`, Playwright, `e2e/` y las evidencias previas.

## Resultado

| Punto retesteado | Resultado | Evidencia |
|---|---|---|
| Paginación de 20 proveedores | FALLIDO | Con 21 filas sintéticas, la UI renderizó las 21 juntas. No existen botones Anterior/Siguiente y el RPC no recibe página ni límite. |
| Búsqueda por Razón Social | APROBADO | `Norte` devolvió únicamente `Corralon Norte S.A`. |
| Búsqueda por CUIT | APROBADO | `12345679` devolvió únicamente CUIT `20-12345679-4`. |
| Búsqueda por Rubro | APROBADO | `Cemento` devolvió las 4 coincidencias reales del rubro. |
| Filtro por estado | APROBADO | Activos mostró 4 activos; Inactivos mostró vacío sin error; Todos mostró los 4 existentes. |
| Filtro por Rubro | APROBADO | Cemento mostró 4 filas y todas correspondían al rubro. |
| Insensible a mayúsculas/minúsculas | APROBADO | `CORRALON NORTE` encontró `Corralon Norte S.A`. |
| Insensible a acentos | APROBADO | `corralon prueba` encontró `Corralón prueba`. |
| Estado vacío | APROBADO | Una búsqueda inexistente mostró `No se encontraron proveedores`. |
| Limpiar filtros | APROBADO | Restauró búsqueda vacía, estado Activos y las 4 filas reales. |
| Proveedor con múltiples rubros sin duplicación | FALLIDO | Una respuesta con el mismo proveedor vinculado a Cemento y Hierros produjo 2 filas y una advertencia React por key duplicada. |

## Automatización focalizada

- Tests de proveedores: 2 archivos, 94/94 aprobados.
- Playwright real: 9 puntos funcionales aprobados, sin `console.error`, excepciones ni respuestas HTTP fallidas.
- Playwright controlado de borde: 21/21 filas visibles sin paginación; proveedor multirrubro duplicado 2 veces.
- No se ejecutó la suite completa.
- No se generaron screenshots porque los defectos no son visuales ambiguos y quedaron reproducidos con evidencia de DOM, request y consola.

## Defectos vigentes

### D1 — Falta paginación cada 20 registros

- Severidad: ALTA
- Esperado: máximo 20 proveedores por página, con navegación y consulta paginada.
- Obtenido: se renderizan las 21 filas juntas y no hay controles de página.
- Evidencia técnica: el request a `buscar_proveedores` sólo contiene `p_search`, `p_rubro_id` y `p_estado`; `0022_buscar_proveedores.sql` no aplica `limit/offset`; `ProveedoresPage.jsx` no implementa paginación.
- Causa probable: paginación ausente en RPC, API y página.

### D2 — Duplicación de proveedores con múltiples rubros

- Severidad: MEDIA
- Esperado: una fila por proveedor, representando correctamente todos sus rubros.
- Obtenido: un proveedor con dos relaciones aparece dos veces; React informa una key `proveedor.id` repetida.
- Evidencia técnica: el `left join` del RPC devuelve una fila por relación, la API conserva cada fila y el listado usa sólo `proveedor.id` como key.
- Causa probable: cardinalidad N:M no agrupada en `buscar_proveedores`/`getProveedores`.

### D3 — Rama desactualizada y colisión de secuencia de migración

- Severidad: ALTA de integración
- Esperado: rama actualizada contra `develop` y número de migración único/ordenable.
- Obtenido: #82 está 22 commits detrás; contiene `0022_buscar_proveedores.sql`, mientras `develop` ya contiene `0022_recepcion_orden_compra.sql` y migraciones posteriores hasta `0027`.
- Evidencia técnica: comparación `origin/develop...s2-06-consultaProv = 22 detrás / 1 delante`; ambos árboles contienen un archivo distinto con prefijo `0022`.
- Causa probable: la PR no fue actualizada ni renumerada después de la evolución de `develop`.

## Resumen

- Casos retesteados: 11
- Aprobados: 9
- Fallidos: 2
- Bloqueados: 0
- La PR queda lista: no

## Decisión

**REQUEST CHANGES**

Los defectos D1 y D2 incumplen el comportamiento requerido; D3 además impide considerar segura la integración de la rama tal como está.
