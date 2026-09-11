# QA PR #80 — CORR-03 / Issue #68

Repositorio: carmelaserrano/Sistema-Corralon. Fecha: 2026-09-06.
Rama examinada: fix/CORR-03-quitar-movimientos-pendientes.
HEAD: 47af70e07de4d16eb6616632abd73a279ca0f129.
Base origin/develop: b992dcd933b49e0385ad21d895a9b92dcc1ab5b5.

Recomendación: **REQUEST CHANGES como retención de aprobación por QA incompleto**, no como solicitud de corregir un defecto funcional demostrado. Completar 3, 5, 6, 7 y 8 con sesión autenticada antes de aprobar. No se realizó ninguna acción en GitHub.

Resumen: 4 APROBADOS, 0 FALLIDOS, 5 BLOQUEADOS. Los aprobados 1, 2 y 4 son verificaciones estáticas y de componentes; no representan navegación E2E autenticada.

## Resultados

| Criterio | Resultado | Evidencia obtenida | Archivo de evidencia | Error/bloqueo | Severidad sugerida | Alcance |
|---|---|---|---|---|---|---|
| 1 | APROBADO | Inspección de Stock y test de Movimientos sin panel/texto de movimientos pendientes. | residuos-src.txt; tests.log | — | — | Validado por código y render de componente; no sesión real. |
| 2 | APROBADO | Navegación sin entrada de pendientes; test de Sidebar pasa. | frontend-source.txt; tests.log | — | — | App usa estado de página; no hay ruta del panel antiguo. |
| 3 | BLOQUEADO | Test multiartículo pasa con una llamada y mensaje de confirmación; impacto real no ejecutado. | tests.log; session.txt | B-80-01 | Alta (bloqueo QA) | Mocks no verifican stock real ni transacción. |
| 4 | APROBADO | Eliminadas ESTADOS, COLUMNAS, validarMovimiento y APIs antiguas; sin consumidores residuales ejecutables. | diff.txt; residuos-src.txt | O-80-01 (comentario) | Baja | Las funciones SQL usadas internamente no son código muerto. |
| 5 | BLOQUEADO | Sidebar llama onNavigate('movimientos') en test; navegación real autenticada no ejecutada. | tests.log; session.txt | B-80-01 | Alta (bloqueo QA) | Conexión App→Movimientos verificada estáticamente. |
| 6 | BLOQUEADO | Ver historial invoca callback una vez en test; pantalla real no visitada. | tests.log; frontend-source.txt; session.txt | B-80-01 | Alta (bloqueo QA) | Callback de App a historial-movimientos presente. |
| 7 | BLOQUEADO | Centro, Cemento Portland y Arena, 10 unidades cada uno, confirmación única: ejecutado solo con mocks. | tests.log; session.txt | B-80-01 | Alta (bloqueo QA) | Stock inicial simulado 25/40; no se comprobó stock final real ni cabecera persistida. |
| 8 | BLOQUEADO | Login sin excepciones ni warnings capturados; consola del flujo autenticado no comprobada. | browser.json; localhost.png; session.txt | B-80-01 | Alta (bloqueo QA) | No puede afirmarse ausencia de regresiones de consola en Movimientos/Historial. |
| 9 | APROBADO | 15 archivos y 205 tests aprobados; build exit 0, 1666 módulos. | tests.log; build.log | — | — | Warnings de toolchain y tamaño de bundle detallados abajo. |

## B-80-01 — Sesión autenticada no accesible

El usuario tiene una sesión manual, pero la inspección de procesos Edge/Chrome no encontró puertos de depuración para conectarse a ese navegador. No hay herramienta de navegador conectada a la sesión. Se abrió Edge aislado mediante CDP; solo mostró el login. No se copiaron cookies, no se inventaron credenciales ni se alteró autenticación. Conforme a la indicación del usuario, los criterios que requieren esa sesión quedan bloqueados. Severidad Alta corresponde a la cobertura QA bloqueada, no a un defecto de la PR.

## Revisión de código y observaciones

La PR cambia cuatro archivos: movimientosApi.js y tres archivos de tests. Elimina la API antigua de alta unitaria, consulta de pendientes, confirmación/cancelación separadas y sus constantes/validación. El frontend activo conserva crear_movimiento_multiarticulo y el historial. App.jsx, navegación y la página productiva de Movimientos no cambian respecto de develop; ya usaban el flujo inmediato. Build exitoso respalda que no quedaron imports rotos.

O-80-01 (Baja, documentación interna): src/modules/stock/api/alertasStockApi.test.js:13 aún comenta «confirmar_movimiento en movimientosApi.js», aunque esa función ya no está allí. No es una llamada, import, query o función muerta y no incumple el criterio 4 tal como está enumerado. No se corrigió.

Los textos «Recepciones pendientes», «Pendiente de conteo» y «Pendiente de aprobación» pertenecen a otros flujos y no se clasifican como movimientos pendientes residuales. Las migraciones históricas conservan funciones SQL: 0016 invoca confirmar_movimiento desde crear_movimiento_multiarticulo dentro de la transacción. Su nombre no demuestra código muerto y no corresponde eliminarlas por esta revisión. No se consultó ni modificó Supabase en esta ejecución.

## Tests y build

- Comando: npm.cmd test -- src/modules/stock src/components/layout/Sidebar.test.jsx
- Resultado: exit 0, 15 archivos aprobados, 205 tests aprobados, duración 32.01 s.
- Incluye pruebas CORR-03 de ausencia de pendientes, navegación por callback a Movimientos e Historial, y una confirmación multiartículo. APIs y datos son mocks.
- Escenario del profesor en test existente: depósito Centro, Cemento Portland y Arena, 10 unidades cada uno, egreso, comprobante REM-10, una llamada a createMovimientoMultiarticulo y mensaje de stock actualizado. No acredita persistencia ni stock real.
- Comando: npm.cmd run build
- Resultado: exit 0, 1666 módulos, build en 4.99 s.
- Warnings: opciones esbuild/optimizeDeps.esbuildOptions de vite:react-babel deprecadas y combinación esbuild/oxc en tests; chunk JS de 500.36 kB en build. Package.json, lockfile versionado y vite.config.js no cambian en la PR (toolchain-diff.txt vacío). Advertencia de chunk >500 kB ya observada en el build anterior de develop. No se ejecutó nuevamente la suite en develop; la atribución de avisos de toolchain a configuración previa es inferencia, no comparación de dos ejecuciones actuales.
- PowerShell registra stderr de npm como NativeCommandError dentro de los logs; el código de salida fue 0 y no implica tests/build fallidos.

## Evidencias y límites

[Diff](diff.txt), [revisiones](revisiones.txt), [búsqueda de residuos](residuos-src.txt), [tests](tests.log), [build](build.log), [captura del login](localhost.png), [consola capturada](browser.json), [código App/navegación](frontend-source.txt), [acceso a sesión](session.txt).

Se reutilizó el script CDP de QA anterior, ampliando únicamente la captura de warnings en el archivo de evidencia browser-check.mjs. Los campos purchasePageInApp/purchaseNavigation de browser.json son heredados de ese recolector y no intervienen en el resultado CORR-03. No se agregaron dependencias.

No se modificó código de aplicación, tests existentes, Supabase, migraciones o datos. Sin commit, push ni acción en GitHub. Se cambió a la rama solicitada y se preservaron package-lock.json previamente modificado y los archivos de QA existentes. Build regeneró dist. El reporte y auxiliares están en qa/pr-80/.

