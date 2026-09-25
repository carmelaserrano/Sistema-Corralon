# QA: S3-10 · Validación de stock disponible en tiempo real

- **Issue**: #105
- **Reviewer / QA**: [@carmelaserrano](https://github.com/carmelaserrano)
- **Estado**: Pendiente de ejecución en Supabase compartido

## Verificaciones automatizadas

- `npm run validate:migrations` — migraciones válidas.
- `npm run lint` — sin errores; permanecen únicamente warnings preexistentes.
- `npm test -- --run src/modules/ventas/api/ventasApi.test.js` — 32 tests OK.
- `npm run build` — OK.

## Casos funcionales

1. Con el seed de **Hierro 8mm** (físico 5, comprometido 3), cargar 3 unidades
   muestra disponible 2 y marca la cantidad en rojo.
2. Confirmar sin Backorder devuelve `STOCK_INSUFICIENTE` (HTTP lógico 422) con
   `producto_id`, `disponible` y `solicitado` por línea.
3. Marcar Backorder confirma la venta, compromete 2 unidades, conserva físico 5
   y registra `cantidad_backorder = 1`.
4. Cambiar el comprometido entre la carga y la confirmación vuelve a validar la
   disponibilidad en la base.

## Prueba de concurrencia (dos sesiones SQL)

Con una unidad disponible, ejecutar simultáneamente en dos sesiones autenticadas:

```sql
select public.registrar_venta(
  jsonb_build_object('deposito_id', '<DEPOSITO>', 'cliente_id', '<CLIENTE>'),
  jsonb_build_array(jsonb_build_object(
    'producto_id', '<PRODUCTO>', 'cantidad', 1,
    'precio_unitario', <PRECIO>, 'descuento_pct', 0
  ))
);
```

El primer commit confirma y aumenta `stock_x_deposito.comprometido` en 1. La
segunda sesión espera el bloqueo de fila y recibe `STOCK_INSUFICIENTE`; no crea
una venta ni modifica el comprometido.
