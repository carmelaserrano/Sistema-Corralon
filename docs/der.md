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

---

## Sprint 3 — Clientes, Ventas y E-commerce

Modelo agregado por `0031_base_sprint3.sql` (issue S3-00). Se apoya sobre
`productos`, `depositos`, `stock_x_deposito` y `medios_pago` del modelo de
arriba; no los duplica.

```mermaid
erDiagram

  CONDICIONES_IVA {
    uuid id PK
    text nombre UK
  }

  TIPOS_CLIENTE {
    uuid id PK
    text nombre UK
    uuid lista_precio_id FK
  }

  CLIENTES {
    uuid id PK
    bigint numero UK
    text tipo_persona
    text tipo_documento
    text numero_documento
    uuid condicion_iva_id FK
    uuid tipo_cliente_id FK
    text estado
    text origen
    boolean habilita_cta_cte
    uuid usuario_web_id FK
  }

  HISTORIAL_ESTADO_CLIENTE {
    uuid id PK
    uuid cliente_id FK
    text estado_anterior
    text estado_nuevo
    timestamptz created_at
  }

  DOMICILIOS_CLIENTE {
    uuid id PK
    uuid cliente_id FK
    text alias
    boolean es_principal
    boolean activo
  }

  LISTAS_PRECIO {
    uuid id PK
    text nombre UK
    boolean activo
  }

  PRECIOS_LISTA {
    uuid id PK
    uuid lista_precio_id FK
    uuid producto_id FK
    numeric precio
  }

  REGLAS_DESCUENTO {
    uuid id PK
    text tipo_aplicacion
    uuid referencia_id
    numeric porcentaje
  }

  AUTORIZACIONES_DESCUENTO {
    uuid id PK
    numeric porcentaje
    uuid autorizado_por FK
    timestamptz expira_at
  }

  PUNTOS_VENTA {
    uuid id PK
    text numero UK
  }

  NUMERACION_COMPROBANTES {
    uuid punto_venta_id FK
    text tipo_comprobante
    text letra
    bigint ultimo_numero
  }

  VENTAS {
    uuid id PK
    bigint numero UK
    uuid deposito_id FK
    uuid cliente_id FK
    uuid vendedor_id FK
    text estado
    numeric total
  }

  DETALLE_VENTA {
    uuid id PK
    uuid venta_id FK
    uuid producto_id FK
    numeric cantidad
    numeric cantidad_backorder
    numeric precio_unitario
    numeric descuento_pct
    uuid autorizacion_descuento_id FK
  }

  HISTORIAL_ESTADO_VENTA {
    uuid id PK
    uuid venta_id FK
    text estado_anterior
    text estado_nuevo
  }

  COMPROBANTES_VENTA {
    uuid id PK
    uuid venta_id FK
    text tipo_comprobante
    text letra
    uuid punto_venta_id FK
    bigint numero
    uuid comprobante_asociado_id FK
    numeric total
    text cae
    text estado
  }

  COBROS_VENTA {
    uuid id PK
    uuid venta_id FK
    bigint numero UK
    numeric total
  }

  DETALLE_COBRO {
    uuid id PK
    uuid cobro_id FK
    uuid medio_pago_id FK
    numeric monto
    numeric vuelto
  }

  CARRITOS {
    uuid id PK
    uuid cliente_id FK UK
  }

  ITEMS_CARRITO {
    uuid id PK
    uuid carrito_id FK
    uuid producto_id FK
    numeric cantidad
  }

  PEDIDOS_WEB {
    uuid id PK
    bigint numero UK
    uuid cliente_id FK
    uuid deposito_id FK
    text tipo_entrega
    uuid domicilio_id FK
    text estado
    numeric total
  }

  DETALLE_PEDIDO_WEB {
    uuid id PK
    uuid pedido_id FK
    uuid producto_id FK
    numeric cantidad
    numeric precio_unitario
  }

  HISTORIAL_ESTADO_PEDIDO {
    uuid id PK
    uuid pedido_id FK
    text estado_anterior
    text estado_nuevo
  }

  CONDICIONES_IVA ||--o{ CLIENTES : "condicion_iva_id"
  TIPOS_CLIENTE ||--o{ CLIENTES : "tipo_cliente_id"
  LISTAS_PRECIO o|--o{ TIPOS_CLIENTE : "lista_precio_id"
  CLIENTES ||--o{ HISTORIAL_ESTADO_CLIENTE : "cliente_id"
  CLIENTES ||--o{ DOMICILIOS_CLIENTE : "cliente_id"
  LISTAS_PRECIO ||--o{ PRECIOS_LISTA : "lista_precio_id"
  PUNTOS_VENTA ||--o{ NUMERACION_COMPROBANTES : "punto_venta_id"
  CLIENTES ||--o{ VENTAS : "cliente_id"
  VENTAS ||--o{ DETALLE_VENTA : "venta_id"
  AUTORIZACIONES_DESCUENTO o|--o{ DETALLE_VENTA : "autorizacion_descuento_id"
  VENTAS ||--o{ HISTORIAL_ESTADO_VENTA : "venta_id"
  VENTAS ||--o{ COMPROBANTES_VENTA : "venta_id"
  PUNTOS_VENTA ||--o{ COMPROBANTES_VENTA : "punto_venta_id"
  COMPROBANTES_VENTA o|--o{ COMPROBANTES_VENTA : "comprobante_asociado_id"
  VENTAS ||--o{ COBROS_VENTA : "venta_id"
  COBROS_VENTA ||--o{ DETALLE_COBRO : "cobro_id"
  CLIENTES ||--o| CARRITOS : "cliente_id"
  CARRITOS ||--o{ ITEMS_CARRITO : "carrito_id"
  CLIENTES ||--o{ PEDIDOS_WEB : "cliente_id"
  DOMICILIOS_CLIENTE o|--o{ PEDIDOS_WEB : "domicilio_id"
  PEDIDOS_WEB ||--o{ DETALLE_PEDIDO_WEB : "pedido_id"
  PEDIDOS_WEB ||--o{ HISTORIAL_ESTADO_PEDIDO : "pedido_id"

```

### Reglas y notas del modelo (Sprint 3)

- `usuarios_internos` separa "quién puede loguearse" (todo `auth.users`,
  incluidos los clientes web) de "quién es parte del equipo interno". Toda
  la RLS interna depende de `es_usuario_interno()`.
- `clientes.usuario_web_id` vincula un cliente con su usuario de Supabase
  Auth cuando se registra desde la tienda (o cuando un cliente de mostrador
  se vincula post-hoc, S3-15).
- El stock disponible del Sprint 3 reusa `stock_x_deposito.comprometido`
  del Sprint 1: `comprometer_stock`/`liberar_stock` lo mueven,
  `egresar_comprometido` recién descuenta la cantidad física al entregar.
- `calcular_precio_venta` resuelve el precio por `tipos_cliente.lista_precio_id`,
  con fallback a la lista `General` si el cliente es `null` o no tiene lista
  asignada.
- Los triggers de negocio (historial de estados, matrices de transición de
  `ventas`/`pedidos_web`) no están en la base: cada issue dueña
  (S3-02/S3-07/S3-16) los agrega en su propia migración.

### Unicidades importantes (Sprint 3)

- `clientes` UNIQUE(`tipo_documento`, `numero_documento`)
- `clientes.usuario_web_id` UNIQUE
- `precios_lista` UNIQUE(`lista_precio_id`, `producto_id`)
- `numeracion_comprobantes` PK(`punto_venta_id`, `tipo_comprobante`, `letra`)
- `comprobantes_venta` UNIQUE(`punto_venta_id`, `tipo_comprobante`, `letra`, `numero`)
- `carritos.cliente_id` UNIQUE
- `domicilios_cliente`: único índice parcial por `(cliente_id)` con
  `es_principal and activo`, y por `(cliente_id, alias)` con `activo`
