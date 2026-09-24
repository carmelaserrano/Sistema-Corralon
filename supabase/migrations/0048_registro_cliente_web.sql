-- ============================================================================
-- S3-15 · Registro e ingreso de cliente web
--
-- Deja registrar_cliente_web(p_datos jsonb): crea el cliente del usuario web
-- autenticado (origen 'Web', tipo 'Consumidor web') o lo vincula con un
-- cliente de mostrador que tenga el mismo documento y todavía no tenga
-- usuario web (CA-03), sin duplicarlo ni pisar sus datos.
--
-- Confirmación de email: el proyecto la tiene activada, así que signUp no
-- devuelve sesión. El front guarda los datos del formulario en los metadatos
-- del usuario y llama a esta función en el primer ingreso con sesión. Por eso
-- tiene que ser idempotente: el mismo usuario puede llamarla más de una vez.
--
-- No toca la 0033 (una migración mergeada no se modifica): la excepción que
-- necesita el trigger de S3-00 se agrega acá con create or replace.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Trigger de S3-00: permitir la vinculación y nada más
-- ----------------------------------------------------------------------------
-- Dentro de una función security definer, auth.uid() sigue siendo el del
-- cliente web, así que es_usuario_interno() da false y el trigger rechazaba
-- el cambio de usuario_web_id que hace la vinculación. Única excepción nueva:
-- pasar usuario_web_id de null al propio auth.uid(). Un cliente web no puede
-- llegar por su cuenta a una fila sin usuario (la policy clientes_update
-- filtra por usuario_web_id = auth.uid()), así que el único camino es
-- registrar_cliente_web. El resto de las columnas protegidas no cambia.

create or replace function public.fn_restringir_update_cliente_web()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if public.es_usuario_interno() then
    return new;
  end if;

  if (new.usuario_web_id is distinct from old.usuario_web_id
        and not (old.usuario_web_id is null and new.usuario_web_id = auth.uid()))
     or new.numero is distinct from old.numero
     or new.tipo_persona is distinct from old.tipo_persona
     or new.nombre is distinct from old.nombre
     or new.apellido is distinct from old.apellido
     or new.razon_social is distinct from old.razon_social
     or new.tipo_documento is distinct from old.tipo_documento
     or new.numero_documento is distinct from old.numero_documento
     or new.condicion_iva_id is distinct from old.condicion_iva_id
     or new.tipo_cliente_id is distinct from old.tipo_cliente_id
     or new.estado is distinct from old.estado
     or new.origen is distinct from old.origen
     or new.habilita_cta_cte is distinct from old.habilita_cta_cte
  then
    raise exception 'Un cliente web solo puede modificar su teléfono y su email'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. registrar_cliente_web
-- ----------------------------------------------------------------------------
-- p_datos: {nombre, apellido, tipo_documento: 'DNI'|'CUIT', numero_documento,
--           telefono}. El usuario sale de auth.uid() y el email de
--           auth.users (ya confirmado); ninguno de los dos se lee del jsonb.
-- Devuelve solo el id del cliente propio.
--
-- Errores (el front los traduce a mensajes genéricos):
--   42501 sin sesión.
--   22023 dato propio inválido (el mensaje dice cuál, no revela terceros).
--   23505 el documento ya tiene usuario web, o el usuario ya está vinculado
--         a otro documento. Mensaje genérico, sin datos del otro cliente.
--
-- Concurrencia: dos locks transaccionales, siempre en el mismo orden (usuario
-- y después documento), serializan el doble submit y dos registros con el
-- mismo documento. Las constraints uq_cliente_documento y
-- uq_cliente_usuario_web quedan de respaldo frente a altas de mostrador.

create or replace function public.registrar_cliente_web(p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario       uuid := auth.uid();
  v_email         text;
  v_nombre        text;
  v_apellido      text;
  v_tipo_doc      text;
  v_documento     text;
  v_telefono      text;
  v_pesos         int[] := array[5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  v_suma          int := 0;
  v_verificador   int;
  v_condicion_iva uuid;
  v_tipo_cliente  uuid;
  v_cliente       public.clientes%rowtype;
  v_id            uuid;
begin
  if v_usuario is null then
    raise exception 'Necesitás iniciar sesión para completar el registro'
      using errcode = '42501';
  end if;

  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Los datos de registro son inválidos' using errcode = '22023';
  end if;

  select lower(btrim(u.email)) into v_email from auth.users u where u.id = v_usuario;
  if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Tu usuario no tiene un email válido' using errcode = '22023';
  end if;

  v_nombre    := nullif(btrim(p_datos->>'nombre'), '');
  v_apellido  := nullif(btrim(p_datos->>'apellido'), '');
  v_tipo_doc  := upper(btrim(coalesce(p_datos->>'tipo_documento', '')));
  v_documento := regexp_replace(coalesce(p_datos->>'numero_documento', ''), '[\s.\-]', '', 'g');
  v_telefono  := nullif(btrim(p_datos->>'telefono'), '');

  if v_nombre is null or length(v_nombre) > 100 then
    raise exception 'Ingresá tu nombre' using errcode = '22023';
  end if;
  if v_apellido is null or length(v_apellido) > 100 then
    raise exception 'Ingresá tu apellido' using errcode = '22023';
  end if;
  if v_telefono is null or v_telefono !~ '^[0-9+()\s-]{6,30}$' then
    raise exception 'Ingresá un teléfono válido' using errcode = '22023';
  end if;

  if v_tipo_doc = 'DNI' then
    if v_documento !~ '^[0-9]{7,8}$' then
      raise exception 'El DNI debe tener 7 u 8 dígitos' using errcode = '22023';
    end if;
  elsif v_tipo_doc = 'CUIT' then
    -- Solo personas físicas: el formulario pide nombre y apellido.
    if v_documento !~ '^(20|23|24|27)[0-9]{9}$' then
      raise exception 'Ingresá un CUIT de persona física válido' using errcode = '22023';
    end if;
    for i in 1..10 loop
      v_suma := v_suma + substr(v_documento, i, 1)::int * v_pesos[i];
    end loop;
    v_verificador := 11 - (v_suma % 11);
    if v_verificador = 11 then
      v_verificador := 0;
    end if;
    if v_verificador = 10 or v_verificador <> substr(v_documento, 11, 1)::int then
      raise exception 'Ingresá un CUIT de persona física válido' using errcode = '22023';
    end if;
  else
    raise exception 'El tipo de documento debe ser DNI o CUIT' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('registrar_cliente_web:usuario:' || v_usuario::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('registrar_cliente_web:documento:' || v_tipo_doc || ':' || v_documento, 0));

  -- Idempotencia: doble submit, o el front reintentando en el primer ingreso.
  select * into v_cliente from public.clientes where usuario_web_id = v_usuario;
  if found then
    if v_cliente.tipo_documento = v_tipo_doc and v_cliente.numero_documento = v_documento then
      return v_cliente.id;
    end if;
    raise exception 'No pudimos completar el registro con esos datos' using errcode = '23505';
  end if;

  -- CA-03: cliente de mostrador (o importado) con el mismo documento.
  select * into v_cliente
  from public.clientes
  where tipo_documento = v_tipo_doc and numero_documento = v_documento
  for update;

  if found then
    if v_cliente.usuario_web_id is not null then
      raise exception 'No pudimos completar el registro con esos datos' using errcode = '23505';
    end if;

    -- Solo se completa lo que falta: nombre, apellido, teléfono y origen de
    -- mostrador se conservan. El email es lo único opcional en clientes.
    update public.clientes
    set usuario_web_id = v_usuario,
        email = coalesce(email, v_email)
    where id = v_cliente.id;

    return v_cliente.id;
  end if;

  select id into v_condicion_iva from public.condiciones_iva where nombre = 'Consumidor Final';
  select id into v_tipo_cliente from public.tipos_cliente where nombre = 'Consumidor web';
  if v_condicion_iva is null or v_tipo_cliente is null then
    raise exception 'Falta configurar la condición de IVA o el tipo de cliente web';
  end if;

  begin
    insert into public.clientes (
      tipo_persona, nombre, apellido, tipo_documento, numero_documento,
      condicion_iva_id, tipo_cliente_id, email, telefono, origen,
      usuario_web_id, created_by
    ) values (
      'fisica', v_nombre, v_apellido, v_tipo_doc, v_documento,
      v_condicion_iva, v_tipo_cliente, v_email, v_telefono, 'Web',
      v_usuario, v_usuario
    )
    returning id into v_id;
  exception when unique_violation then
    -- Un alta de mostrador simultánea con el mismo documento (no toma el lock).
    raise exception 'No pudimos completar el registro con esos datos' using errcode = '23505';
  end;

  return v_id;
end;
$$;

-- Supabase da execute a anon por default privileges: no alcanza con public.
revoke execute on function public.registrar_cliente_web(jsonb) from public, anon;
grant execute on function public.registrar_cliente_web(jsonb) to authenticated;

commit;

-- Fin migración 0048
