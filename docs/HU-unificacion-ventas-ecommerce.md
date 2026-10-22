# HU: Unificar las ventas del ecommerce y de mostrador

## Historia de usuario

**Como** responsable de ventas y tesorería,  
**quiero** que las compras del ecommerce confirmadas como pagadas se registren en las mismas tablas de ventas que las operaciones de mostrador y se asocien a una caja exclusiva llamada **Ecommerce**,  
**para** consultar y controlar todas las ventas desde un único lugar, identificando su origen.

## Descripción

Actualmente, las ventas de mostrador se registran en `ventas` y `detalle_venta`, mientras que los pedidos del ecommerce se guardan en `pedidos_web` y `detalle_pedido_web`.

Cuando se aprueba el pago de un pedido web, el sistema debe registrar la venta y sus productos en las tablas comunes de ventas, asociarlos a la caja Ecommerce y vincular la venta con el pedido web original. La tabla de pedidos web se conserva para gestionar el checkout, la preparación, la entrega y el seguimiento del pedido.

La caja Ecommerce se configura una sola vez y permanece activa. La registración de cada compra debe realizarse automáticamente, sin requerir que un cajero abra o cierre manualmente una sesión por pedido.

## Criterios de aceptación

1. **Registro de una venta web:** dado un pedido web cuyo pago fue aprobado, cuando el sistema confirma el pago, registra una venta en `ventas` y sus productos en `detalle_venta`.
2. **Datos de la venta:** la venta conserva el cliente, el depósito, los productos, las cantidades, los precios y el total correspondientes al pedido.
3. **Vínculo con el pedido:** la venta queda vinculada de forma consultable con el pedido web que la originó.
4. **Asociación con la caja Ecommerce:** toda venta y cobro originado en el ecommerce queda asociado a la caja Ecommerce y se puede distinguir de las operaciones de mostrador mediante esa caja.
5. **Caja disponible permanentemente:** la caja Ecommerce se configura una vez y permanece activa para recibir compras. No se requiere una apertura o cierre manual por cada pedido.
6. **Identificación del proceso automático:** las operaciones web quedan atribuidas al usuario o actor técnico Ecommerce, sin requerir la intervención de un cajero humano.
7. **Prevención de duplicados:** si se recibe más de una vez la confirmación de pago de un mismo pedido, se mantiene una sola venta y un solo registro de cobro para ese pedido.
8. **Pagos no aprobados:** los pedidos con pagos rechazados, vencidos o cancelados no generan una venta cobrada ni un ingreso en la caja Ecommerce.
9. **Stock:** la confirmación del pedido no descuenta ni compromete stock más de una vez; se respeta el mecanismo existente de reserva para pedidos web.
10. **Pedido y entrega:** el pedido web conserva la información y los estados necesarios para su preparación, entrega y seguimiento luego de generar la venta.
11. **Consulta unificada:** el historial y los informes de ventas incluyen operaciones web y de mostrador, y permiten identificar las ventas web por su asociación con la caja Ecommerce.
12. **Migración del historial:** los pedidos web históricos con pago aprobado se incorporan a `ventas` y `detalle_venta`, asociados a la caja Ecommerce y vinculados al pedido original.
13. **Integridad de la migración:** se conservan las fechas e importes originales y no se duplican ventas, cobros, facturas ni movimientos de stock. Los pedidos sin pago aprobado no se migran como ventas.

## Reglas y alcance

- Para esta HU, una compra se considera confirmada cuando su pago queda aprobado.
- `ventas` y `detalle_venta` son el registro común de las ventas de ambos canales.
- `pedidos_web` y `detalle_pedido_web` se mantienen para la información y el flujo propio del pedido web; no se eliminan como parte de esta HU.
- La integración no debe crear una segunda venta ni repetir efectos existentes de pago o stock al migrar el historial.

## Nota sobre el esquema actual

En el esquema actual, `ventas` todavía no tiene una asociación directa con una caja. La implementación deberá definir cómo se representa esa asociación usando el modelo de caja y sesiones existente, de forma que las ventas web puedan atribuirse a Ecommerce sin exigir una operación manual por pedido.
