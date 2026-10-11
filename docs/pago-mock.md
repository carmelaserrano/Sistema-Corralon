# Pago mock de e-commerce

La tienda siempre usa el pago simulado, sin flags de frontend ni cambios en `.env`.
Checkout crea el pedido y su reserva mediante `crear_pedido_web`, abre la pantalla
mock, obtiene el total persistido y confirma mediante `confirmar_pago_mock`.
La confirmación delega en el mismo núcleo que `confirmar_pago_pedido`: conserva
historial, carrito, reserva comprometida y posterior entrega. La referencia estable
`mock:<pedido UUID>` y el bloqueo de fila evitan duplicados incluso entre sesiones.

Requiere la migración `0066_pago_mock.sql` en la base de datos del entorno.
La migración activa explícitamente el modo demo. Para deshabilitarlo con un operador
privilegiado: `update pago_interno.configuracion set habilitado = false;`.
No habilitar este modo en un entorno que acepte cobros reales: permite que un cliente
apruebe sus propios pedidos sin transferir dinero. La RPC exige sesión, cliente activo,
propiedad y reserva vigente. El núcleo privado no es ejecutable por clientes.

La tarjeta es un elemento visual fijo; no hay campos de número ni CVV. El rechazo
registra el resultado y permite reintentar sin liberar la reserva. Un error al sincronizar
la vista del carrito no degrada un pago ya confirmado en base de datos.
Las transiciones usan 150–220 ms y respetan `prefers-reduced-motion`.

Validación frontend: `npm test -- src/modules/ecommerce`.
Validación SQL aislada (sin Supabase remoto):
`npm install --prefix .temp/ventas-db --no-save --ignore-scripts @electric-sql/pglite`
y `node scripts/probar-integracion-pedidos-web.mjs`.
La dependencia de prueba queda fuera del bundle y de package.json/package-lock.json.
