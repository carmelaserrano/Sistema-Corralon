# QA rápido — PR #90 / S2-14 Historial de OC

Fecha: 2026-09-10  
Rama evaluada: `feature/S2-14-historial-oc`  
Commit: `dc037f2edfac37506e291380a6d35d07d2b8899d`  
Base: PR #89 (`a309d1bded2e1e4139bc7461c65dee01d461b8d7`) sobre `origin/develop` (`1126fd328d895933c8474c957f6c61368bcb8265`)

## Alcance

La rama de #90 contiene los cambios completos de #89; `git merge-base --is-ancestor` confirmó esa relación. No se hicieron commit, push, merge, cambios de código ni migraciones.

## Resultado

| Caso retesteado | Resultado | Evidencia funcional |
|---|---|---|
| Listado de historial | APROBADO | Se mostraron 21 OC con número, fecha, proveedor, depósito, total, estado y recepciones. |
| Filtros combinados proveedor/fecha/estado | APROBADO | Corralón Norte + 2026-09-10 + Recibida devolvió 3 coincidencias, todas conformes. |
| Orden por fecha ascendente/descendente | APROBADO | Primeros números: 1,2,3 en ascendente y 21,20,19 en descendente. |
| Orden por total ascendente/descendente | APROBADO | Primeros números: 10,11,12 en ascendente y 5,4,2 en descendente. |
| Cantidad de recepciones | APROBADO | La lista y el detalle reflejaron la cantidad vinculada; la OC QA #8 mostró su recepción #6. |
| Detalle de OC y artículos/cantidades | APROBADO | La OC #8 mostró artículo y cantidades pedida 1, recibida 1, pendiente 0. |
| Recepciones, facturas y notas | APROBADO | En #8 se visualizaron recepción #6, factura A 6305-61408597 y nota de crédito A 6305-61408598. |
| Estado vacío y limpiar filtros | APROBADO | Un rango sin datos mostró el vacío contextual; limpiar restauró las 21 OC. |
| Paginación de 20 | APROBADO | Página 1: 20 filas; página 2: 1 fila. |
| Total de registros e importe filtrado | APROBADO | El total se mantuvo en 21 y el importe global en `$3.120.374,00` al cambiar de página/orden. |
| Canceladas no suman | APROBADO | El filtro Cancelada mostró 3 registros y total `$0.00`. |
| Consulta no modifica OC ni stock | APROBADO | Snapshots de `id`, estado, total y auditoría de OC, y de cantidad/auditoría de stock, fueron idénticos antes y después de filtrar, ordenar y paginar. |

## Pruebas focalizadas

- `OrdenesCompraPage.test.jsx` + `historialOcApi.test.js`: 10/10 aprobadas.
- Regresión focalizada de recepción: 39/39 aprobadas.
- Total focalizado compartido #89/#90: 49/49.
- Playwright autenticado: todos los escenarios anteriores aprobados.
- Consola: 0 errores JavaScript/`console.error`.
- Red: 0 respuestas HTTP fallidas relevantes.

## Resumen

- Casos retesteados: 12
- Aprobados: 12
- Fallidos: 0
- Bloqueados: 0
- Defectos propios encontrados: ninguno

## Dependencia y orden de integración

#90 está construido directamente sobre #89. El orden seguro es mergear primero #89 y luego actualizar/verificar #90 contra el nuevo `develop` antes de mergearlo. No corresponde mergear ambas ramas abiertas en el orden inverso.

## Decisión

**APPROVE**
