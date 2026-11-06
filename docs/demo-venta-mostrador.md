# Demo: venta en mostrador (2:30)

Guión para mostrar el POS de punta a punta: depósito → cliente → artículos → confirmar → cobro → factura en PDF.
Pantalla: **Ventas → Nueva venta** (`#nueva-venta`), visible para Vendedor y Administrador.

## Antes de empezar (5 minutos antes, fuera de cámara)

- `npm run dev` y sesión abierta con rol **Vendedor** (o Administrador).
- **Caja abierta a tu usuario**: Tesorería → Cajas → **caja de prueba** (punto de venta 0002, la que está asignada a tu usuario) → *Abrir caja* → monto inicial → *Confirmar apertura*. Sin esto el cobro no se puede registrar y la demo se corta a mitad de camino.
- La caja tiene un **punto de venta activo** (de ahí sale el número de factura).
- Datos listos: depósito **Depósito Centro**, cliente **Juan Pérez (DNI 30111222)**, artículos **Cemento Portland** y **Arena** con stock > 0 en ese depósito y precio asignado.
- Pestaña ya en `#nueva-venta` con el carrito vacío (botón *Reiniciar* arriba a la derecha).
- Zoom del navegador en ~90% para que entren los 4 pasos y el panel *Resumen* sin scrollear.

## El guión

| Tiempo | Acción en pantalla | Qué decir |
|---|---|---|
| 0:00–0:10 | Ventas → Nueva venta | "Entro como vendedor, con la caja del turno ya abierta." |
| 0:10–0:20 | Paso 1: elegir *Depósito Centro* | "Primero el depósito: de acá salen el stock y los precios." |
| 0:20–0:40 | Paso 2: escribir `30111222` → elegir Juan Pérez | "Busco por DNI; solo lista clientes habilitados. El tipo de cliente define la lista de precios y la condición de IVA, la letra de la factura." |
| 0:40–1:20 | Paso 3: buscar `cemento` → agregar → cantidad **10**; buscar `arena` → cantidad **2** | "El buscador trae solo artículos activos con stock en este depósito. Al cambiar la cantidad, precio unitario, subtotal y total se recalculan en el momento." |
| 1:20–1:30 | Paso 4: una observación corta + señalar el panel *Resumen* | "Observaciones para el mostrador. A la derecha, el resumen: depósito, cliente, ítems y total." |
| 1:30–1:40 | **Confirmar venta** → pantalla de éxito | "Una sola transacción: número correlativo, estado Pendiente y stock comprometido." |
| 1:40–2:10 | Modal *Registrar cobro* (se abre solo): medio **Efectivo**, importe = total, *Dinero entregado* 20.000 → mirar el **Vuelto** → **Confirmar cobro** | "El modal valida la caja abierta y el punto de venta. Cargo el efectivo y lo que entregó el cliente; el vuelto lo calcula el sistema. Si paga con dos medios, *Agregar medio de pago*." |
| 2:10–2:30 | Detalle de la venta: número de factura → **Descargar PDF** | "Al confirmar el cobro la factura se emite automáticamente. La descargo en PDF, y con *Iniciar nueva venta* el mostrador queda listo para el próximo cliente." |

## Qué no hacer en vivo

- **No cambiar el depósito con artículos cargados**: abre un confirm del navegador y vacía el carrito.
- **No cerrar la caja**: desde el PR #167, *Cerrar caja* queda deshabilitado si el efectivo contado no coincide exactamente con el esperado. Es correcto, pero en vivo parece un botón roto.
- **No elegir un cliente inactivo**: no aparece en el buscador.
- **No cargar artículos sin precio o sin stock**: *Confirmar venta* queda deshabilitado y no se ve por qué.

## Si algo falla

- *"No hay una caja abierta para registrar el cobro"*: la venta ya quedó guardada en estado Pendiente, no se pierde. Abrís la caja en Tesorería → Cajas y volvés por Ventas → detalle → *Registrar cobro*.
- *Stock insuficiente al confirmar*: el aviso muestra disponible vs. solicitado. Bajás la cantidad o tildás *Aceptar espera* (backorder), que compromete solo lo disponible.
- *Precio desactualizado*: el sistema vuelve a pedir los precios vigentes; confirmás de nuevo.

## Extras si sobran 20–30 segundos

- Descuento manual que supera el límite: abre el modal de autorización y la venta guarda el id de autorización.
- Agregar dos veces el mismo artículo: suma la cantidad en la línea existente, no duplica la fila.
- Cobro con dos medios: efectivo + tarjeta (pide los últimos 4 dígitos).
