# S2-11 — Estado de órdenes de compra

Rama: `feature/S2-11-estado-oc`, desde `origin/develop`.
QA aceptador: Nicolás Salas Farjat (@nicoosalas).
Casos preparados para incorporar al Excel externo de Sprint 2; ejecución y aceptación manual pendientes.

| Caso | Acción | Resultado esperado |
| --- | --- | --- |
| CA1 | Consultar OC en los cuatro estados | Pendiente azul, Parcial ámbar, Recibida verde y Cancelada gris, con texto identificador |
| CA2 | Crear OC sin recepciones | Estado Pendiente |
| CA3 | Recibir 4 de 10 unidades de un renglón | Estado Parcial automático; pedida 10, recibida 4, pendiente 6 |
| CA4 | Completar todos los renglones con otra recepción | Estado Recibida automático; pendientes en cero |
| CA5 | Abrir detalle con varios productos parcialmente recibidos | Cantidades pedidas, recibidas y pendientes correctas por renglón |
| CA6 | Intentar recibir nuevamente una OC Recibida | No disponible en selector; RPC rechaza sin modificar stock |
| CA7 | Filtrar por cada estado y volver a Todos | Solo órdenes del estado seleccionado; Todos elimina filtro |
| Paginación | Con más de 50 órdenes, avanzar y cambiar filtro | Consulta páginas en servidor; cambiar filtro vuelve a página 1 |
| Actualización | Consultar detalle y volver; pulsar Actualizar tras otra recepción | Se consultan nuevamente estados persistidos |
| Carga/error/vacío | Demorar o rechazar consulta; filtrar un estado sin resultados | Indicador de carga, error recuperable con Actualizar, vacío contextual sin presentarlo como error |
| Auditoría | Confirmar recepción parcial y total | OC conserva created_by/created_at y actualiza updated_by/updated_at |
| Stock | Ejecutar pruebas de recepción y suite de Stock | Ingreso por producto/depósito, máximos y rollback conservados |

Se reutiliza la migración `0022_recepcion_orden_compra.sql`: actualización transaccional de cantidades/estado, auditoría, límites y bloqueo de OC recibidas. No se requiere migración nueva. La cancelación ya existe en el módulo y conserva su comportamiento.

Validación automatizada: `npm test`, `npm run build`, `npm run lint`, `node scripts/probar-recepcion-oc.mjs` (requiere la dependencia local PGlite indicada en ese script).
El PR, revisión, aceptación QA y merge a develop quedan pendientes.
