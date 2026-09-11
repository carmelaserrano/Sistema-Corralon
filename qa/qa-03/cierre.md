# Cierre QA-03 / Issue #61 — Matriz de Compras

Fecha: 2026-09-11  
Base consolidada: `develop` en `67b5b227fcfd0282a0523d15ea504b39d00fe9b4`

## Consolidado

| Historia | Total | Aprobados | Fallidos | Bloqueados | Pendientes | Defectos abiertos | Decisión QA |
|---|---:|---:|---:|---:|---:|---|---|
| S2-08 | 14 | 10 | 4 | 0 | 0 | 4: acumulación de producto y 3 estructuras residuales de solicitudes | REQUEST CHANGES |
| S2-09 | 8 | 1 | 6 | 1 | 0 | 5 funcionales; queda 1 caso bloqueado por falta de proveedor QA inactivo controlado | REQUEST CHANGES |
| S2-10 | 10 | 3 | 7 | 0 | 0 | 4 grupos: edición, guardas de cancelación, auditoría y metadatos visibles | REQUEST CHANGES |
| S2-11 | 9 | 9 | 0 | 0 | 0 | Ninguno | APPROVE |
| S2-12 | 11 | 11 | 0 | 0 | 0 | Ninguno bloqueante según el estado de cierre indicado | APPROVE |
| S2-14 | 12 | 12 | 0 | 0 | 0 | Ninguno | APPROVE |
| Cierre transversal de matriz | 6 | 6 | 0 | 0 | 0 | Ninguno | APPROVE |
| **Total** | **70** | **52** | **17** | **1** | **0** | **13 defectos funcionales/técnicos agrupados** | **CIERRE QA CON RECHAZOS DOCUMENTADOS** |

## Métricas

- Cobertura: **70/70 casos categorizados, 100%**.
- Casos ejecutados: **70**.
- Aprobados: **52 (74,3%)**.
- Fallidos: **17 (24,3%)**.
- Bloqueados: **1 (1,4%)**.
- Pendientes sin resultado: **0**.
- Defectos abiertos en este alcance: **5 de severidad Alta, 7 Media y 1 Baja**.

## Trazabilidad de defectos abiertos

- Alta: panel/datos N:M del proveedor en OC; cambio de proveedor sin confirmación; modificación de OC ausente; auditoría de modificación ausente; cancelación sin guardas de estado/recepción/factura.
- Media: acumulación de un mismo producto; tres residuos de solicitudes; búsqueda/filtro de proveedor dentro de OC; ficha completa de proveedor; metadatos visibles de cancelación.
- Baja: mensaje específico al omitir proveedor.
- Bloqueo QA residual: caso de desactivación de proveedor sin un registro QA controlado.

## Historias aceptadas y no aceptadas

- Aceptadas: S2-11, S2-12 y S2-14.
- No aceptadas: S2-08, S2-09 y S2-10.
- Los fallos no se convierten en bloqueos de ejecución: quedan registrados como alcance no aceptado del Sprint 2.

## ¿QA-03 puede darse por cerrado?

**SÍ, desde la responsabilidad de ejecución y documentación de Nicolás.** Todos los casos tienen resultado y trazabilidad local. El cierre no implica aceptar las historias fallidas. La revisión del otro QA, la eventual copia al Excel y el cierre administrativo de GitHub permanecen fuera de esta sesión y no fueron ejecutados.
