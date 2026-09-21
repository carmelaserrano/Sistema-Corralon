# QA rápido — PR #89 / S2-11 Estados de OC

Fecha: 2026-09-10  
Rama evaluada: `feature/S2-14-historial-oc`  
Commit de #89 contenido: `a309d1bded2e1e4139bc7461c65dee01d461b8d7`  
Base: `origin/develop` en `1126fd328d895933c8474c957f6c61368bcb8265`

## Alcance

Se utilizó la rama de #90 porque contiene íntegramente el commit de #89 y agrega el historial sobre esa base. No se hicieron commit, push, merge, cambios de código ni migraciones. Se conservaron `.env.qa.local`, Playwright, `e2e/` y las evidencias existentes.

## Resultado

| Caso retesteado | Resultado | Evidencia funcional |
|---|---|---|
| Estados Pendiente, Parcial, Recibida y Cancelada | APROBADO | Los cuatro estados estuvieron disponibles y el filtro devolvió exclusivamente 12, 1, 5 y 3 OC respectivamente en los datos de la sesión. |
| OC sin recepciones queda Pendiente | APROBADO | La OC QA #9 nació en estado Pendiente. |
| Recepción parcial cambia a Parcial | APROBADO | Al recibir 2/4 unidades del primer artículo, la OC #9 pasó a Parcial. |
| Recepción total cambia a Recibida | APROBADO | Al completar los pendientes, la OC #9 pasó a Recibida. |
| Detalle pedida/recibida/pendiente | APROBADO | Tras la recepción parcial se observaron 4/2/2 y 2/0/2; al completar quedaron pendientes en cero. |
| Bloqueo de nueva recepción sobre OC Recibida | APROBADO | La OC completada dejó de aparecer entre las OC seleccionables para recepción. |
| Filtro por estado | APROBADO | Pendiente, Parcial, Recibida, Cancelada y Todos reflejaron el estado persistido. |
| Persistencia UI/base | APROBADO | Los estados observados después de cada recepción coincidieron al recargar las consultas. |
| Sin alteración indebida de stock | APROBADO | Cemento cambió 11→13→15 y Pastina 18→18→20: únicamente las cantidades recibidas, en el depósito destino. |

## Pruebas focalizadas

- `OrdenesCompraPage.test.jsx` + `historialOcApi.test.js`: 10/10 aprobadas.
- `RecepcionesPage.test.jsx` + `recepcionesApi.test.js`: 39/39 aprobadas.
- Total focalizado compartido #89/#90: 49/49.
- Playwright autenticado en localhost: flujo Pendiente→Parcial→Recibida, detalle, filtros y bloqueo de nueva recepción aprobados.
- Consola: 0 errores JavaScript/`console.error`.
- Red: 0 respuestas HTTP fallidas relevantes.

## Datos QA

Se creó la OC identificable `QA-PR89-90-1789072691868` (#9) con dos artículos y sus dos recepciones controladas. También se generaron 12 OC pendientes identificadas con el mismo prefijo para alcanzar el umbral de paginación del historial. No se alteraron registros ajenos ni se hizo limpieza destructiva.

## Resumen

- Casos retesteados: 9
- Aprobados: 9
- Fallidos: 0
- Bloqueados: 0
- Defectos propios encontrados: ninguno

## Decisión

**APPROVE**

