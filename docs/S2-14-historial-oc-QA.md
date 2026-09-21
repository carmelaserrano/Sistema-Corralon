# S2-14 — Historial de órdenes de compra

Rama `feature/S2-14-historial-oc`, basada en S2-11 aún pendiente de merge. Integrar S2-11 antes del PR de S2-14 a develop.

## Preparación

Aplicar `supabase/migrations/0027_historial_oc.sql` después de las migraciones anteriores. No modifica stock ni datos de negocio: agrega una consulta de solo lectura, con RLS y acceso autenticado. La auditoría de OC existente se conserva.

Los filtros usan `created_at` en horario argentino, incluyendo ambos días extremos. Los proveedores inactivos están disponibles en el filtro histórico. El importe excluye canceladas; la cantidad de registros incluye todas las órdenes que cumplen los filtros. Ordenar no modifica los totales.

## Casos para el Excel externo

| Caso | Acción | Resultado esperado |
| --- | --- | --- |
| CA1 | Abrir historial con OC sin recepciones y con varias | Número, creación, proveedor, depósito, total, estado y cantidad de recepciones correctos |
| CA2 | Combinar proveedor, fechas y estado | Se aplican todas las condiciones, incluso para proveedores inactivos |
| Fechas | Consultar un solo día y registros cerca de medianoche | Solo creaciones de ese día en Argentina, inclusive; rango invertido rechazado |
| CA3 | Ordenar por fecha y total en ambas direcciones | Orden global correcto, también al cambiar página |
| CA4 | Seleccionar fila o usar Ver detalle | Cabecera, artículos con cantidades, recepciones, facturas y notas asociadas |
| Vínculos | Factura directa y por recepción; notas vigentes, desvinculadas y pagos | Factura sin duplicación; solo notas con vínculo vigente, con importe aplicado a la factura |
| CA5 | Buscar sin coincidencias y pulsar Limpiar filtros | Vacío contextual; se restauran todas las órdenes |
| CA6 | Consultar más de 20 órdenes y avanzar | Páginas de 20, conteo global e importe global constante para los mismos filtros |
| Canceladas | Incluir canceladas y luego filtrar solo canceladas | Cuentan como registros; no suman al importe; solo canceladas da importe cero |
| Error/carga | Demorar consulta, fallar y usar Actualizar | Carga visible, error sin resultados engañosos, recuperación |
| Regresión | Crear OC, confirmar recepción parcial y total | Se mantiene el circuito de S2-08/S2-11/S2-12 y el stock |

## Validación

`npm test`, `npm run lint`, `npm run build`, `npm run validate:migrations` y `node scripts/probar-recepcion-oc.mjs` (PGlite local). La prueba SQL agrega escenarios de paginación, filtros, límites horarios, canceladas y RLS en una base efímera.

Pendientes: aplicación y verificación en Supabase real, aceptación por Nicolás Salas Farjat, carga en Excel externo, revisión y merge del PR.
