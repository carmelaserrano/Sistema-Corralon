# Registro web inmediato en demo

## Configuración necesaria

En el proyecto que usa VITE_SUPABASE_URL: **Authentication -> Sign In / Providers -> Email -> Confirm email: OFF**, guardar. En versiones del dashboard que agrupan proveedores bajo Providers, abrir Email allí. Es un ajuste de Auth del proyecto, no del frontend ni de .env. Afecta todos los registros por email de ese proyecto; usar el proyecto demo.

Consulta de solo lectura realizada el 14/10/2026 a GET /auth/v1/settings: mailer_autoconfirm=false, disable_signup=false. Ese fue el estado inicial. Luego el usuario desactivó Confirm email para su prueba real. El agente no modificó configuración remota.

Referencia: https://supabase.com/docs/reference/javascript/auth-signup

## Comportamiento

Antes: signUp guarda perfil en user_metadata; sin sesión muestra Revisá tu correo. Tras confirmar e ingresar, obtenerClienteActual completa el cliente pendiente.

Ahora: validar -> signUp -> sesión automática -> registrar_cliente_web -> cargar cliente propio en ClienteWebContext -> Cuenta creada correctamente -> Ir al catálogo. Si no llega sesión, se intenta signInWithPassword con los datos en memoria. Si Auth exige confirmar, se informa que falta configurar Confirm email; nunca se simula una sesión ni un registro completo.

La RPC existente (0048) toma el usuario de auth.uid() y el email de auth.users. Crea clientes de origen Web o vincula el cliente existente por documento mediante clientes.usuario_web_id. Sus locks y constraints hacen idempotentes las llamadas concurrentes del registro y del evento SIGNED_IN. No inserta usuarios_internos ni roles. Se mantienen las validaciones, RLS y recuperación de perfiles pendientes de cuentas existentes. No requiere migración.

Duplicados: user_already_exists y respuestas ofuscadas con identities=[] muestran un mensaje de email ya registrado. Los conflictos de la RPC muestran un mensaje de documento/vinculación, sin revelar datos ajenos. Un fallo de vinculación no anuncia éxito; la cuenta Auth puede existir y el próximo login reintenta el perfil pendiente. No volver a registrar ese email.

## Verificación remota pendiente

Después de cambiar el setting, registrar una cuenta de prueba con email y documento únicos; comprobar sesión, cliente con usuario_web_id igual al Auth ID, ausencia de ese ID en usuarios_internos, carrito/checkout y salida/reingreso. Repetir el email debe mostrar error. Verificar también una cuenta previa. El ajuste no es una migración masiva de cuentas antiguas sin confirmar: comprobar esas cuentas por separado, sin modificar ni confirmar usuarios existentes automáticamente.

Los tests locales simulan Supabase y verifican API, vinculación solicitada, contexto, pantalla y navegación. No sustituyen esta prueba contra Auth y RLS reales. No se crearon cuentas remotas ni se cambiaron datos remotos.

## Correccion posterior a la prueba real

CarritoSesion tenia key por cliente y envolvia las pantallas: al cambiar de visitante a cliente desmontaba RegistroPage, perdiendo sus estados locales. Ahora solo el motor del carrito tiene key; los providers y las pantallas permanecen montados. Se mantiene el aislamiento de carritos entre cuentas. TiendaShell publico contiene siempre ClienteWebProvider; el componente que consume el hook queda privado. createContext se aloja en un modulo separado para conservar su identidad al refrescar componentes en desarrollo.

No se reprodujo el stack de useClienteWeb sin provider en el arbol original de TiendaApp: ya envolvia al shell. Una diferencia de identidad del contexto durante HMR es una hipotesis, no una causa confirmada del incidente del navegador. El nuevo test monta TiendaApp/TiendaShell con providers reales, StrictMode, SIGNED_IN, TOKEN_REFRESHED y rerender.

Diagnostico remoto de solo lectura: DNI 30111222 existe y actualmente no tiene usuario_web_id. El log de PostgreSQL de 14/10/2026 20:40:09 UTC contiene SQLSTATE 23505, contexto registrar_cliente_web linea 123: es el handler de unique_violation del INSERT, no el rechazo explicito de documento ya vinculado. La funcion reemplaza el error original y pierde el nombre de la constraint, por lo que ese log no permite atribuirlo a documento, numero o usuario. No se alteraron datos ni funciones remotas.

Si Auth ya existe y falla la vinculacion, se conserva la sesion y se ofrece Completar registro con perfil precargado. Se puede corregir DNI/CUIT o reintentar. No se vuelve a llamar signUp. La recuperacion guarda exclusivamente el perfil propio en user_metadata mediante updateUser y llama la misma RPC autenticada, que sigue imponiendo validaciones y propiedad. Al recargar o volver a ingresar se recupera el perfil pendiente; el login no cierra la sesion de una cuenta pendiente por un conflicto de vinculacion. Los metadatos no conceden roles ni permisos. Si el documento realmente pertenece a otra cuenta, se debe usar el documento propio o consultar en sucursal; nunca se roba la vinculacion.
