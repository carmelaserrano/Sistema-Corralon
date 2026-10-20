# Pago mock de e-commerce

La tienda siempre usa el pago simulado, sin flags de frontend ni cambios en `.env`.
Checkout crea el pedido y su reserva mediante `crear_pedido_web`, abre la pantalla
mock, obtiene el total persistido y confirma mediante `confirmar_pago_mock`.
La confirmación delega en el mismo núcleo que `confirmar_pago_pedido`: conserva
historial, carrito, reserva comprometida y posterior entrega. La referencia estable
y el bloqueo de fila evitan duplicados incluso entre sesiones.

Requiere `0066_pago_mock.sql` y `0071_medios_pago_mock.sql` en el entorno.
0066 activa explícitamente el modo demo. Para deshabilitarlo con un operador
privilegiado: `update pago_interno.configuracion set habilitado = false;`.
No habilitar este modo en un entorno que acepte cobros reales: permite que un cliente
apruebe sus propios pedidos sin transferir dinero. La RPC exige sesión, cliente activo,
propiedad y reserva vigente. El núcleo privado no es ejecutable por clientes.

La pantalla ofrece tres medios:

- Tarjeta: número, titular, vencimiento y CVV con validaciones locales. La tarjeta
  `0000 0000 0000 0000` permite probar rechazo; otra tarjeta con formato válido
  se aprueba. Sus datos no se envían ni se conservan después de aprobar.
- Mercado Pago: confirmación simulada dentro de la tienda, sin SDK ni navegación externa.
- Transferencia bancaria: alias y CBU ficticios identificados como demo, con botón
  para simular la acreditación. No son datos bancarios reales.

Los tres usan la misma RPC mock. La firma de dos argumentos se conserva para
Tarjeta; la de tres recibe el medio (`tarjeta`, `mercado_pago`, `transferencia`).
0071 guarda en `referencia_pago` el formato `mock:<medio>:<pedido UUID>` sin
agregar columnas. Las referencias históricas `mock:<pedido UUID>` representan
Tarjeta. La UI y el PDF recuperan el medio desde esa referencia persistida, no
desde almacenamiento local. Referencias desconocidas muestran «No informado».

Los reintentos, incluso con otro medio, conservan el primer pago confirmado,
su referencia y `pagado_at`. El rechazo registra el resultado y permite reintentar
sin liberar la reserva. Un error al sincronizar
la vista del carrito no degrada un pago ya confirmado en base de datos.
Las transiciones usan 150–220 ms y respetan `prefers-reduced-motion`.

Después de aprobar se muestran pedido, total, medio y descarga del comprobante.
La misma descarga está disponible en Mis pedidos y se conserva después de
recargar. Los pedidos nunca pagados no ofrecen comprobante y el generador los
rechaza. Ver [flujo de cobro y comprobantes](ventas-facturacion-comprobante-web.md).

Validación: `npm test -- src/modules/ecommerce --maxWorkers=2`.
Incluye pruebas SQL aisladas con PGlite, sin conexión a Supabase remoto.
PGlite es una dependencia de desarrollo; no forma parte del bundle de la tienda.
