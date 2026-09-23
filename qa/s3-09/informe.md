# Informe de QA: S3-09 · Registro de venta en mostrador (POS) #104

- **Rama**: `feature/S3-09-registro-venta`
- **Issue**: [#104](https://github.com/carmelaserrano/Sistema-Corralon/issues/104) — S3-09 · Registro de venta en mostrador (POS)
- **Reviewer / QA**: [@carmelaserrano](https://github.com/carmelaserrano)
- **Estado**: ✅ Listo para QA

---

## 1. Cobertura de Criterios de Aceptación

| Criterio | Descripción | Estado | Verificación |
|---|---|---|---|
| **CA-01** | Orden de carga en pantalla: Depósito → Cliente → Artículos (grilla tipo carrito) → Observaciones → Confirmar. | ✅ Cumplido | Implementado en `NuevaVentaPage.jsx` con secciones ordenadas y validaciones progresivas de flujo. |
| **CA-02** | Buscador de clientes filtra únicamente clientes habilitados (`cliente_habilitado_para_vender` / `estado = 'Activo'`). | ✅ Cumplido | `buscarClientes` en `ventasApi.js` filtra por `estado = 'Activo'` y busca por nombre, apellido, razón social o documento. |
| **CA-03** | Buscador de artículos lista solo productos activos con stock disponible > 0 en el depósito seleccionado. | ✅ Cumplido | `buscarArticulos` consulta `v_stock_disponible` con filtro `deposito_id` y `disponible > 0`, uniendo contra productos activos. |
| **CA-04** | Al modificar la cantidad, el precio unitario (`calcular_precio_venta`), subtotal de línea y total se recalculan en tiempo real. | ✅ Cumplido | Reactividad en `LineasVenta.jsx` con `calcularPrecioVenta` y `calcularTotalesVenta`. Probado en tests unitarios. |
| **CA-05** | Si un descuento manual requiere autorización (`validar_descuento_manual`), abre `ModalAutorizacionDescuento`, guarda `autorizacion_id` y la función `registrar_venta` lo valida con `autorizacion_descuento_valida`. | ✅ Cumplido | Integrado en `LineasVenta.jsx` y validado transaccionalmente en la migración `0038_registrar_venta.sql`. |
| **CA-06** | Confirmación de venta crea registro con número correlativo, estado `'Pendiente'`, líneas y reserva de stock en una sola transacción. Se pueden quitar/modificar líneas antes de confirmar. | ✅ Cumplido | Función SQL `registrar_venta` transaccional con `comprometer_stock` y registro en `ventas`, `detalle_venta` e `historial_estado_venta`. |
| **CA-07** | Si se agrega un mismo artículo dos veces, suma la cantidad a la línea existente en vez de duplicar fila. | ✅ Cumplido | `agregarArticuloALineas` busca coincidencia por `producto_id` y acumula cantidades recalculando subtotales. Testeado exhaustivamente. |

---

## 2. Datos de Prueba Utilizados

- **Depósito**: Depósito Centro
- **Cliente**: Juan Pérez (DNI 30111222, tipo Consumidor Final)
- **Artículos**: Cemento Portland x 10 y Arena x 2 m³

---

## 3. Verificación Automatizada

- **Migraciones**: `npm run validate:migrations`
  ```
  Migraciones OK: 38 archivo(s) válidos en "supabase/migrations".
  ```
- **Linter**: `npm run lint`
  ```
  0 errors, 3 warnings (warnings preexistentes de react-refresh en contextos).
  ```
- **Tests & Cobertura**: `npm run test:coverage`
  ```
  40 test files passed (822 tests).
  Cobertura global: Stmts 84.51%, Branch 78.26%, Funcs 83.38%, Lines 86.52% (umbral >= 70% superado).
  ventasApi.js: Stmts 95.14%, Lines 97.84%, Funcs 100%.
  ```
- **Build**: `npm run build`
  ```
  ✓ built in 1.60s (dist/ generado exitosamente).
  ```

---

## 4. Archivos Modificados / Creados (Sección Propiedad)

- `src/modules/ventas/pages/NuevaVentaPage.jsx`
- `src/modules/ventas/components/LineasVenta.jsx`
- `src/modules/ventas/api/ventasApi.js`
- `src/modules/ventas/api/ventasApi.test.js`
- `supabase/migrations/0038_registrar_venta.sql`
- `qa/s3-09/informe.md`

