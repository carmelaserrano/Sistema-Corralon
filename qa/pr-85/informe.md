# QA integral — PR #85 — S2-16 Notas de crédito y débito

Fecha: 2026-09-10  
Rama evaluada: `feature/S2-15-orden-de-pago`  
Commit: `73e7c3d326997ad60884d476f56ccadd78c7a27a`  
Cadena incluida: #85 → #86 → #87

## Resultado ejecutivo

El retest funcional de #85 fue satisfactorio en los diez criterios. Las correcciones de `fn_recalcular_saldo_nc`, estado inicial y mensaje de eliminación están desplegadas y verificadas. Sin embargo, la migración 0024 todavía puede fallar o alterar comprobantes históricos, y el alta con vínculo automático continúa dividida en dos operaciones no atómicas.

**Resultado: REQUEST CHANGES.**

## Resultado por criterio — formato para matriz QA

| CA | Estado | Resultado obtenido | Defecto asociado | Severidad | Evidencia textual |
|---|---|---|---|---|---|
| CA1 | APROBADO | Pantalla propia `Notas de Crédito/Débito`, navegación y listado cargaron correctamente. | — | — | Encabezado visible; 0 alertas al abrir. |
| CA2 | APROBADO | Crédito 20 redujo factura 130→110; débito 10 aumentó 110→120. | — | — | Saldos consultados inmediatamente después de cada imputación. |
| CA3 | APROBADO | Proveedor, tipo, letra, sucursal, número, fecha e importe son obligatorios. | — | — | Submit vacío bloqueado por validación HTML; fecha viene precargada. |
| CA4 | APROBADO | Proveedor obligatorio; factura opcional y filtrada al proveedor elegido. | — | — | Para Corralon Norte solo se ofreció `M 0084-00846477`. |
| CA5 | APROBADO | Débito `M 8587-00008502` creado con factura quedó Aplicada y recalculó 110→120 automáticamente. | D-85-02 | Media | Nota saldo 0/Aplicada e imputación por 10 creadas. |
| CA6 | APROBADO | Crédito `A 8587-00008501` sin factura quedó Disponible con saldo 30/30. | — | — | Fila persistida con `estado=disponible`, `saldo_pendiente=30`. |
| CA7 | APROBADO | Selector mostró facturas del mismo proveedor con saldo pendiente. | — | — | Única opción QA: `M 0084-00846477`, saldo 130 al alta. |
| CA8 | APROBADO | Duplicado rechazado por proveedor+tipo+letra+sucursal+número. | — | — | Mensaje exacto `La nota ya fue registrada`; conteo permaneció en 1. |
| CA9 | APROBADO | Filtros por proveedor, tipo, estado y rango de fechas devolvieron la nota esperada. | — | — | Filtro final localizó únicamente `A 8587-00008501` como Aplicada parcial. |
| CA10 | APROBADO | Nota aplicada no pudo eliminarse e informó la factura concreta. | — | — | `NT001`: `facturas: M-0084-00846477`; la nota permaneció. |

## Retest de defectos anteriores

| Hallazgo anterior | Estado actual | Evidencia |
|---|---|---|
| Migración y datos históricos | **SIGUE VIGENTE** | Hay backfill, pero `tipo` y `estado` se actualizan antes de eliminar los checks viejos; además `lpad` trunca valores largos. |
| `fn_recalcular_saldo_nc` referencia tabla renombrada | CORREGIDO | 0024/0025 usan `notas_proveedor`; vínculo y desvínculo recalcularon saldos correctamente. |
| Escritura directa puede dejar estado distinto de Disponible | CORREGIDO | `fn_init_saldo_nc` fuerza `saldo=importe` y `estado='disponible'`. |
| CA10 no identifica imputación concreta | CORREGIDO | Respuesta real identificó `M-0084-00846477`. |

## Defectos

### D-85-01 — Backfill histórico puede fallar y truncar comprobantes

- Severidad: **Alta**.
- Descripción: 0024 convierte `tipo` a `CREDITO` antes de eliminar `chk_nc_tipo`, y `estado` a `disponible` antes de eliminar `chk_nc_estado`. Con filas provenientes de 0013, esos `UPDATE` chocan con los constraints todavía activos.
- Adicionalmente, `lpad(valor, 4/8, '0')` trunca por la derecha cuando el valor supera el largo solicitado, contradiciendo el comentario de la migración y pudiendo causar pérdida de dígitos o colisiones.
- Esperado: quitar/reemplazar constraints antes del backfill y abortar explícitamente ante longitudes mayores, sin truncar.
- Obtenido: migración dependiente del contenido y potencialmente destructiva.
- Causa probable: orden incorrecto de DDL/DML y supuesto incorrecto sobre `lpad`.
- Archivo probable: `supabase/migrations/0024_notas_proveedor.sql:50-112`.
- Evidencia: documentación oficial de [funciones de strings de PostgreSQL](https://www.postgresql.org/docs/current/functions-string.html).

### D-85-02 — Alta y vínculo automático no son atómicos

- Severidad: **Media**.
- Descripción: `createNota` inserta la nota y después llama por separado a `vincular_nota_factura`.
- Esperado: si el usuario selecciona factura, nota, imputación y recálculo se confirman o revierten juntos.
- Obtenido: si falla la segunda llamada, la nota queda creada como Disponible aunque el usuario eligió una factura.
- Causa probable: alta directa desde cliente seguida de una RPC independiente.
- Archivo probable: `src/modules/compras/api/notasProveedorApi.js:252-289`.

## Validaciones técnicas

- Unique correcto: `(proveedor_id, tipo, letra, sucursal, numero)`.
- Crédito/débito usan importes positivos y signo contable correcto.
- Cuenta corriente: crédito en debe; débito en haber.
- Sin referencias ejecutables residuales a la tabla renombrada luego de 0025.
- Ambiente desplegado no coincide textualmente con la última función de la rama: el mensaje CA10 corresponde a una versión previa, aunque cumple el criterio. Requiere revisar historial de migraciones antes de desplegar los archivos renumerados.

## Ejecución

- Tests focalizados compartidos: 4 archivos, 63/63 aprobados.
- Validador de migraciones: 26 archivos válidos por nombre/numeración.
- Lint: 0 errores, 1 warning preexistente en `AuthContext.jsx`.
- Build: aprobado, 1676 módulos; warning no bloqueante por chunk >500 kB.
- Suite completa: no ejecutada.
- Screenshots: 0.
- Review GitHub: no publicada.

## Conclusión

CA aprobados: **1–10**.  
CA fallidos: **ninguno**.  
CA bloqueados: **ninguno**.  
Defectos: **D-85-01 Alta, D-85-02 Media**.  
**REQUEST CHANGES.**
