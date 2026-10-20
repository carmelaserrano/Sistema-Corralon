# Cobro, facturación automática y comprobante de compra web

## Venta en mostrador

El POS crea la venta y reserva stock con `registrar_venta`. A continuación abre
`ModalCobro` en la misma pantalla. Confirmar invoca `registrar_cobro`, que registra
el cobro completo y llama a `emitir_comprobante` antes de devolver éxito.

La migración `0070_cobro_facturacion_automatica.sql` conserva la firma y las
validaciones de cobro anteriores. Los triggers existentes asocian la sesión de
caja y registran sus movimientos; la emisión existente conserva punto de venta,
letra A/B y numeración. Si falla la factura, PostgreSQL revierte cobro, detalle,
movimientos, factura, numeración e historial. La venta creada previamente sigue
Pendiente para corregir el problema y reintentar.

Se exige aplicar exactamente el total, aunque se combinen medios. No hay cobros
parciales independientes. Cuenta corriente conserva habilitación y límite.
Se requieren los permisos de cobrar y facturar, una caja abierta y un punto de
venta activo. Los bloqueos y los índices únicos impiden cobros/facturas duplicados;
un reintento del cobro devuelve `CV003`, sin consumir otra numeración.

El POS muestra la confirmación y abre el detalle para consultar o descargar la
factura. La facturación manual permanece para ventas históricas ya cobradas.
Se conserva la emisión con CAE de homologación: no se incorpora facturación real
ante un proveedor fiscal.

## Caja activa

El modal consulta `obtenerSesionCajaActiva` al abrirse, filtrando por el UID
autenticado y estado abierta. Muestra caja, punto de venta, responsable y estado
como información no editable. No agrega un selector ni cambia la asignación.

Mientras consulta muestra «Consultando caja activa…». Si falta una sesión válida,
muestra «No hay una caja abierta para registrar el cobro.» y bloquea la
confirmación. Los errores de consulta también quedan visibles y bloquean el cobro.
La validación definitiva y la asociación del movimiento se conservan en la base.

## Sesión de tienda

Backoffice y tienda comparten Auth. Cuando un cliente web recibe acceso denegado
al backoffice, se redirige a la tienda sin cerrar la sesión compartida. El acceso
interno sigue bloqueado.

`ClienteWebContext` comparte la carga por UID entre `ingresar` y `SIGNED_IN`.
Una instantánea `INITIAL_SESSION` atrasada no reemplaza una transición posterior.
Al recargar, un proveedor nuevo recupera la sesión persistida y vuelve a consultar
el cliente. Un error de red en esa consulta se informa sin ejecutar `signOut`;
una cuenta realmente sin cliente conserva su error o flujo de registro pendiente.
El cierre de sesión explícito continúa limpiando el cliente.

## Comprobante de compra web

`remitoWebPdf.js` conserva sus exportaciones para las integraciones existentes,
pero genera un comprobante de compra pagada, con aclaración no fiscal:

- Corralón Norte, número de pedido, cliente y DNI/CUIT cuando existe.
- Fecha y hora de `pagado_at` en Argentina; `created_at` como respaldo histórico.
- Productos, cantidades, precio unitario, subtotales y total pagado.
- Pago aprobado, modalidad de entrega, medio y referencia persistidos.
- La leyenda «Documento no válido como factura.».

La confirmación consulta nuevamente el pedido y sus productos para descargarlo.
Mis pedidos permite descargar el mismo comprobante desde lista y detalle. Tanto
la interfaz como el generador bloquean pedidos nunca pagados. La descarga se
conserva al avanzar la entrega y cuando hay evidencia de un pago anterior a una
cancelación. No se incluyen número de tarjeta, titular ni CVV del formulario.

Los tres medios demo y sus referencias se describen en [Pago mock](pago-mock.md).

## Migraciones y validación

Las migraciones de esta implementación son `0070_cobro_facturacion_automatica.sql`
y `0071_medios_pago_mock.sql`. `0069_informe_egresos.sql` pertenece a develop y no
se modifica. El historial del entorno remoto validado quedó con 0069 egresos,
0070 cobro/facturación y 0071 medios mock. No volver a ejecutar SQL ya aplicado
para corregir únicamente una entrada de historial.

Los tests SQL usan `@electric-sql/pglite`, dependencia de desarrollo fijada en
versión. Ejecutan funciones y triggers extraídos de las migraciones sobre tablas
locales de prueba; no sustituyen una validación remota de RLS o concurrencia.

```sh
npm test -- src/App.test.jsx src/lib/AuthContext.test.jsx src/modules/auth src/modules/ventas src/modules/tesoreria src/modules/ecommerce --maxWorkers=2
npm run lint
npm run build
npm run validate:migrations
git diff --check
```

La cobertura incluye atomicidad y rollback de factura, numeración, medios
combinados, caja, reintentos, sesión web, descargas y bloqueo de impagos.
Los E2E remotos de mostrador, tarjeta aprobada/rechazada, Mercado Pago demo,
transferencia demo, comprobantes y recarga fueron verificados con limpieza QA.
