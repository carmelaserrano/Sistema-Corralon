# Registro web inmediato (entorno demo)

## Configuración necesaria en Supabase

**Authentication → Sign In / Providers → Email → Confirm email: OFF** y guardar.

Es un ajuste del proyecto de Supabase, no del código ni del `.env`. Afecta a todos los registros por email de ese proyecto, así que se usa solo en el proyecto demo. Además evita el límite de envío de correos de Supabase, que bloqueaba registros seguidos.

Referencia: https://supabase.com/docs/reference/javascript/auth-signup

## Cómo funciona

1. Se validan los datos del formulario.
2. `signUp` crea el usuario de Auth y devuelve la sesión. Si no la devuelve, se intenta ingresar con el email y la contraseña que están en memoria (no se guardan).
3. Con la sesión, la RPC `registrar_cliente_web` (migración 0048) crea el cliente web o vincula uno existente por documento (`clientes.usuario_web_id`). No crea usuarios internos ni roles.
4. Recién ahí se muestra "Tu cuenta ya está lista".

Si Supabase sigue pidiendo confirmar el email, se muestra un aviso: falta desactivar Confirm email. Nunca se simula una sesión.

## Errores y cuentas pendientes

- **Email ya registrado:** "Ese email ya tiene una cuenta. Ingresá con tu email y contraseña".
- **Documento asociado a otro cliente:** mensaje sobre el DNI/CUIT, sin mostrar datos de otra persona.
- **Cuenta pendiente:** si la cuenta de Auth se creó pero la vinculación falló, la sesión se conserva y la tienda ofrece **Completar registro** con los datos precargados (se puede corregir el DNI/CUIT) o **Usar otra cuenta** para cerrar sesión. No se vuelve a llamar a `signUp`. Los datos pendientes se guardan en los metadatos del propio usuario y no dan roles ni permisos.

## Prueba manual

1. Registrar una cuenta con email y documento nuevos: tiene que entrar directo y mostrar "Tu cuenta ya está lista".
2. En Supabase, el cliente tiene `usuario_web_id` igual al id del usuario de Auth, y ese id no está en `usuarios_internos`.
3. Agregar al carrito, cerrar sesión y volver a ingresar: el carrito se conserva.
4. Registrar de nuevo el mismo email: tiene que mostrar el error de email ya registrado.
5. Registrar con el documento de un cliente que ya tiene cuenta web: tiene que ofrecer corregir el documento o usar otra cuenta.
