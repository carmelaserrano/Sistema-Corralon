# DER del módulo Stock

```mermaid
erDiagram

  CATEGORIAS {
    uuid id PK
    text nombre UK
    timestamptz created_at
  }

  MARCAS {
    uuid id PK
    text nombre UK
    timestamptz created_at
  }

  UNIDADES_MEDIDA {
    uuid id PK
    text nombre UK
    text abreviatura
    timestamptz created_at
  }

  TIPOS_DEPOSITO {
    uuid id PK
    text nombre UK
    timestamptz created_at
  }

  DEPOSITOS {
    uuid id PK
    text nombre
    text direccion
    uuid tipo_deposito_id FK
    timestamptz created_at
  }

  PRODUCTOS {
    uuid id PK
    text sku UK
    text nombre
    text descripcion
    uuid categoria_id FK
    uuid marca_id FK
    uuid unidad_medida_id FK
    text codigo_barras UK
    text estado_producto
    numeric costo_medio_ponderado
    timestamptz created_at
  }

  STOCK_X_DEPOSITO {
    uuid id PK
    uuid producto_id FK
    uuid deposito_id FK
    numeric cantidad
    numeric comprometido
    timestamptz updated_at
  }

  CONFIGURACION_STOCK {
    uuid id PK
    uuid producto_id FK
    uuid deposito_id FK
    numeric min_stock
    numeric max_stock
    timestamptz created_at
  }

  TIPOS_MOVIMIENTO {
    uuid id PK
    text nombre UK
    timestamptz created_at
  }

  MOVIMIENTOS_STOCK {
    uuid id PK
    uuid tipo_movimiento_id FK
    uuid deposito_origen_id FK
    uuid deposito_destino_id FK
    timestamptz fecha
    text observaciones
    uuid created_by FK
    timestamptz created_at
    text estado_movimiento
  }

  DETALLE_MOVIMIENTO {
    uuid id PK
    uuid movimiento_id FK
    uuid producto_id FK
    numeric cantidad
    timestamptz created_at
  }

  RECEPCIONES {
    uuid id PK
    uuid orden_compra_id
    uuid deposito_destino_id FK
    text estado_recepcion
    text observaciones
    uuid created_by FK
    timestamptz created_at
    uuid confirmado_by FK
    timestamptz confirmado_at
  }

  DETALLE_RECEPCION {
    uuid id PK
    uuid recepcion_id FK
    uuid producto_id FK
    numeric cantidad
    numeric costo_unitario
    timestamptz created_at
  }

  %% Relaciones y cardinalidades (según FKs reales)
  TIPOS_DEPOSITO ||--o{ DEPOSITOS : "tipo_deposito_id"
  CATEGORIAS o|--o{ PRODUCTOS : "categoria_id"
  MARCAS o|--o{ PRODUCTOS : "marca_id"
  UNIDADES_MEDIDA ||--o{ PRODUCTOS : "unidad_medida_id"
  PRODUCTOS ||--o{ STOCK_X_DEPOSITO : "producto_id"
  DEPOSITOS ||--o{ STOCK_X_DEPOSITO : "deposito_id"
  PRODUCTOS ||--o{ CONFIGURACION_STOCK : "producto_id"
  DEPOSITOS ||--o{ CONFIGURACION_STOCK : "deposito_id"
  TIPOS_MOVIMIENTO ||--o{ MOVIMIENTOS_STOCK : "tipo_movimiento_id"
  DEPOSITOS o|--o{ MOVIMIENTOS_STOCK : "deposito_origen_id"
  DEPOSITOS o|--o{ MOVIMIENTOS_STOCK : "deposito_destino_id"
  MOVIMIENTOS_STOCK ||--o{ DETALLE_MOVIMIENTO : "movimiento_id"
  PRODUCTOS ||--o{ DETALLE_MOVIMIENTO : "producto_id"
  DEPOSITOS ||--o{ RECEPCIONES : "deposito_destino_id"
  RECEPCIONES ||--o{ DETALLE_RECEPCION : "recepcion_id"
  PRODUCTOS ||--o{ DETALLE_RECEPCION : "producto_id"

```

---

Nota: `movimientos_stock.created_by` es una clave foránea hacia `auth.users(id)` del sistema Supabase Auth.

## Reglas y notas del modelo

- `stock_x_deposito.cantidad` representa el stock físico.
- `stock_x_deposito.comprometido` representa el stock reservado o comprometido.
- El stock disponible NO se almacena en la base; se calcula como `cantidad - comprometido`.
- `configuracion_stock` almacena el `min_stock` y `max_stock` por `producto` y `deposito`.
- `costo_medio_ponderado` pertenece a `productos` (por artículo), no a nivel depósito.
- `movimientos_stock` y `detalle_movimiento` son históricos e inmutables para usuarios `authenticated`.
- Para `authenticated` solamente existen permisos `SELECT` e `INSERT` sobre `movimientos_stock` y `detalle_movimiento`.
- No existen policies `UPDATE` ni `DELETE` para esas dos tablas.
- `recepciones` y `detalle_recepcion` siguen el mismo criterio: solo `SELECT`/`INSERT` para `authenticated`, y el paso de `pendiente` a `confirmada` ocurre únicamente dentro de la función `confirmar_recepcion` (`SECURITY DEFINER`).
- `recepciones.orden_compra_id` es un `uuid` sin foreign key: el módulo de Compras todavía no existe en este esquema.

## Unicidades importantes

- `categorias.nombre` UNIQUE
- `marcas.nombre` UNIQUE
- `unidades_medida.nombre` UNIQUE
- `tipos_deposito.nombre` UNIQUE
- `productos.sku` UNIQUE
- `productos.codigo_barras` UNIQUE
- `stock_x_deposito` UNIQUE(`producto_id`, `deposito_id`)
- `tipos_movimiento.nombre` UNIQUE
- `configuracion_stock` UNIQUE(`producto_id`, `deposito_id`)

---

Si detectás alguna inconsistencia de cardinalidad o querés que incluya tipos más detallados, lo ajusto.

## Versión gráfica

![DER del módulo Stock](der-stock.svg)
