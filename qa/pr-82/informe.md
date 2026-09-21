# Informe QA — PR #82

Fecha: 2026-09-10  
PR: `feat(proveedores): buscar proveedores por razon social, CUIT o rubro`  
Rama: `s2-06-consultaProv`  
Commit evaluado: `7e105e42a0bb5e50b3e3403f4c641cd252069573`  
Base: `origin/develop` en `7ae9bac0a2b5b76003c5cb4d1a344400523611fe`

## Alcance y restricciones

- No se hicieron commits ni push.
- No se modificó código funcional.
- No se corrigieron defectos.
- No se ejecutaron migraciones ni se modificó Supabase.
- No se alteraron proveedores ni datos existentes.
- Se agregaron únicamente artefactos locales de QA bajo `qa/pr-82/`.

## Resumen técnico

La PR reemplaza la consulta REST del listado por el RPC `buscar_proveedores`, agrega búsqueda unificada por razón social/CUIT/rubro, filtro de rubro, estados vacío/carga y limpieza de filtros. El SQL usa `security invoker`, restringe `EXECUTE` a `authenticated` y mantiene la aplicación de RLS de las tablas subyacentes.

La implementación no contiene paginación: el RPC no recibe página/límite ni aplica `limit/offset`, la API devuelve el arreglo completo y la página renderiza todos los proveedores sin controles. Esto incumple CA7 de US-PRV-03 aunque el criterio no figure en el Issue #49.

También se detectó un riesgo funcional confirmado por inspección: `proveedor_rubro` es N:N y sólo tiene PK compuesta `(proveedor_id, rubro_id)`. El `left join` del RPC emite una fila por vínculo; la API transforma cada fila en un proveedor y la UI usa `proveedor.id` como key. Un proveedor asociado a más de un rubro aparece duplicado y genera keys React repetidas.

## Resultados automatizados

| Verificación | Resultado | Detalle |
|---|---|---|
| Tests de proveedores | APROBADO | 2 archivos, 94/94 tests |
| Suite completa Vitest | APROBADO | 24 archivos, 409/409 tests |
| Lint | APROBADO CON WARNING | 0 errores; 1 warning en `src/lib/AuthContext.jsx:35` (`react-refresh/only-export-components`) |
| Build | APROBADO CON WARNING | Vite produjo `dist`; warning por chunk JS de 516.60 kB |
| Playwright localhost | APROBADO CON OBSERVACIÓN | Login y CA1–CA6 ejecutados; 23 llamadas al RPC, sin responses fallidas, excepciones, `console.error` ni mutaciones |

Vitest también imprime dos stacks de `useAuth debe usarse dentro de AuthProvider`; corresponden al caso negativo intencional de `AuthContext.test.jsx`. La suite termina con exit code 0.

## Resultado por criterio de aceptación

| CA | Resultado QA | Evidencia disponible |
|---|---|---|
| CA1. Activos por defecto | **APROBADO** | 4 filas visibles, todas en estado ACTIVO; el RPC recibió `p_estado: activo` |
| CA2. Parcial por Razón Social/CUIT/Rubro, sin mayúsculas ni acentos | **APROBADO** | Aprobaron razón social parcial, cambio de mayúsculas/minúsculas, texto sin acentos, CUIT parcial y búsqueda por rubro |
| CA3. Filtro por Rubro | **APROBADO** | El RPC recibió el rubro seleccionado y las 4 filas observadas pertenecían a ese rubro |
| CA4. Activos/Inactivos/Todos | **APROBADO** | Los tres valores dispararon el filtro correcto; había 0 inactivos y 4 registros al seleccionar Todos |
| CA5. Sin coincidencias + limpiar filtros | **APROBADO** | Se mostró la leyenda esperada y la limpieza restableció búsqueda vacía, todos los rubros y Activos |
| CA6. Indicador de carga | **APROBADO** | Indicador observado mediante una demora controlada de la primera respuesta del RPC |
| CA7. Paginación cada 20 | **FALLIDO** | El entorno sólo tenía 4 registros, por lo que el corte no pudo reproducirse funcionalmente; el incumplimiento permanece confirmado por ausencia de implementación |

## Defectos encontrados

### D1 — Falta paginación de 20 registros

- Severidad: ALTA
- Criterio: CA7 / US-PRV-03
- Pasos de reproducción:
  1. Iniciar sesión con un usuario habilitado.
  2. Entrar a Proveedores.
  3. Seleccionar Todos con más de 20 proveedores disponibles.
  4. Observar el listado y buscar controles de página.
- Esperado: máximo 20 proveedores visibles por página y navegación entre páginas.
- Obtenido: la función devuelve toda la colección y la UI renderiza todas las filas; no hay navegación.
- Evidencia: `proveedoresApi.js:183-202`, `0022_buscar_proveedores.sql:23-74`, `ProveedoresPage.jsx:813-916`.
- Componente probable: API/RPC y `ProveedoresPage`.

### D2 — Posibles proveedores duplicados cuando tienen varios rubros

- Severidad: MEDIA
- Precondición: un proveedor ya asociado a dos o más rubros; no se crearon datos para probarlo.
- Pasos de reproducción:
  1. Iniciar sesión y abrir Proveedores.
  2. Mostrar un proveedor que tenga dos vínculos existentes en `proveedor_rubro`.
  3. Observar el listado y la consola React.
- Esperado: cada proveedor aparece una sola vez, con una representación definida de sus rubros.
- Obtenido por análisis: el `left join` produce una fila por rubro, la API conserva cada fila y la UI las renderiza con la misma key `proveedor.id`.
- Evidencia: `0013_migracionbase_sprint2.sql:67-72`, `0022_buscar_proveedores.sql:54-61`, `proveedoresApi.js:198-201`, `ProveedoresPage.jsx:864-865`.
- Componente probable: `buscar_proveedores` y normalización de `getProveedores`.

## Cobertura y riesgos pendientes

- El E2E autenticado ejecutó el RPC real: se verificaron búsquedas parciales, case-insensitive, accent-insensitive, CUIT, rubro, combinación de filtros, estado vacío y limpieza.
- No había proveedores inactivos; se verificaron la opción, el parámetro `p_estado: inactivo` y el estado vacío, pero no una fila inactiva real.
- Sólo había 4 proveedores al seleccionar Todos. La prueba funcional no podía superar el umbral de 20, aunque la revisión técnica demuestra que no existe ninguna paginación.
- Se monitorearon 23 llamadas al RPC sin errores HTTP ni fallos de red. No hubo `console.error`, excepciones JavaScript ni requests de modificación sobre las tablas de proveedores/rubros.
- No se observaron errores visuales evidentes ni overflow horizontal.
- El Issue #49 contiene CA1–CA6, pero no CA7.

## Evidencia

- Resultado Playwright válido del 2026-09-10: login aprobado, CA1–CA6 aprobados, CA7 funcionalmente limitado a 4 registros.
- No se generaron capturas en esta ejecución porque no se encontró un defecto visual que las justificara.
- Los artefactos de la ejecución bloqueada anterior permanecen en el directorio, sin cambios.

## Recomendación

**REQUEST CHANGES**

Motivo determinante: CA7 está confirmado como no implementado. CA1–CA6 aprobaron funcionalmente, pero la PR no cumple todos los criterios de US-PRV-03. También conviene resolver o descartar explícitamente el caso de múltiples rubros antes de aprobar.
