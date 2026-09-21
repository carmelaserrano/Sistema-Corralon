-- Migración 0035: administración del estado del cliente.
--
-- Historia: S3-02 — Activo / Inactivo / Bloqueado, con motivo e historial.
--
-- clientes.estado y historial_estado_cliente (con su columna motivo) ya
-- existen desde la 0031. Lo que falta es la lógica de negocio: quién puede
-- cambiar el estado, cuándo el motivo es obligatorio, y que quede
-- registrado sin importar por dónde entre el cambio.
--
-- No se toca la 0031 (regla del repo: una migración ya mergeada no se toca).

begin;

-- ============================================================================
-- 1) Motivo del cambio: cómo llega a un trigger
-- ============================================================================
-- historial_estado_cliente.motivo no es una columna de `clientes`, así que
-- un trigger AFTER/BEFORE UPDATE (que sólo ve OLD/NEW de esa fila) no tiene
-- forma de leerlo directamente. La solución: la función que hace el UPDATE
-- dejalo en una variable de sesión con alcance de transacción
-- (set_config(..., true) = is_local), y el trigger la lee con
-- current_setting(..., true) (el segundo `true` = no fallar si no está
-- seteada). Como PostgREST envuelve cada llamada a esta función en una sola
-- transacción, no hay riesgo de que el motivo de un pedido se filtre a otro
-- por reuso de conexión: is_local la borra sola al terminar la transacción.

-- ============================================================================
-- 2) Trigger: valida y escribe el historial (CA-01, CA-02)
-- ============================================================================
-- Vive en un trigger y no sólo en la función de abajo para que quede
-- garantizado pase lo que pase: si mañana alguien actualiza `clientes.estado`
-- por otro camino (SQL Editor, un futuro módulo), igual queda el motivo
-- exigido y el historial escrito. Mismo criterio que
-- fn_registrar_cambio_estado_proveedor (0020).
--
-- El permiso se valida acá y no sólo en la policy de RLS porque
-- "clientes_update" (0031) acepta clientes.modificar O clientes.estado para
-- cualquier UPDATE de la tabla: no distingue qué columna se está tocando.
-- Sin este chequeo, alguien con sólo clientes.modificar (de S3-01) podría
-- cambiar el estado sin pasar por acá y sin dejar rastro (CA-04).
--
-- security definer: historial_estado_cliente sólo tiene policy de SELECT
-- (0031, sección 13.2); sin definer, el INSERT de acá quedaría bloqueado por
-- RLS. auth.uid() sigue devolviendo el usuario real de la request, no el
-- dueño de la función: security definer sólo cambia los permisos sobre
-- tablas, no de dónde sale auth.uid().

create or replace function public.fn_registrar_cambio_estado_cliente()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_motivo text;
begin
  if new.estado is distinct from old.estado then
    if not public.usuario_tiene_permiso('clientes.estado') then
      raise exception 'No tenés permiso para cambiar el estado del cliente'
        using errcode = '42501';
    end if;

    v_motivo := nullif(btrim(current_setting('app.motivo_cambio_estado', true)), '');

    if new.estado <> 'Activo' and v_motivo is null then
      raise exception 'El motivo es obligatorio para pasar a %', new.estado
        using errcode = '23514';
    end if;

    insert into public.historial_estado_cliente (
      cliente_id, estado_anterior, estado_nuevo, motivo, usuario_id
    ) values (
      new.id, old.estado, new.estado, v_motivo, auth.uid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_clientes_historial_estado on public.clientes;
create trigger trg_clientes_historial_estado
  before update on public.clientes
  for each row execute function public.fn_registrar_cambio_estado_cliente();


-- ============================================================================
-- 3) RPC: punto de entrada único desde la app (CA-01)
-- ============================================================================
-- `returns setof` (no `returns public.clientes` a secas) para poder
-- encadenar `.single()` del lado del cliente: mismo patrón que
-- crear_movimiento_multiarticulo (0016) y registrar_recepcion_oc (0011).
--
-- @param p_cliente uuid del cliente.
-- @param p_estado_nuevo 'Activo' | 'Inactivo' | 'Bloqueado'.
-- @param p_motivo Obligatorio salvo p_estado_nuevo = 'Activo'; lo valida el
--   trigger de arriba, no esta función.
-- @returns el cliente ya actualizado.
create or replace function public.cambiar_estado_cliente(
  p_cliente uuid,
  p_estado_nuevo text,
  p_motivo text default null
)
returns setof public.clientes
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_cliente public.clientes;
begin
  perform set_config('app.motivo_cambio_estado', coalesce(p_motivo, ''), true);

  update public.clientes
     set estado = p_estado_nuevo
   where id = p_cliente
  returning * into v_cliente;

  if not found then
    raise exception 'El cliente no existe o no tenés permiso para modificarlo'
      using errcode = '42501';
  end if;

  return next v_cliente;
end;
$$;

revoke all on function public.cambiar_estado_cliente(uuid, text, text) from public;
grant execute on function public.cambiar_estado_cliente(uuid, text, text) to authenticated;


-- ============================================================================
-- 4) cliente_habilitado_para_vender: de versión base a definitiva (CA-06)
-- ============================================================================
-- El cuerpo no cambia: "estado = 'Activo'" ya era la regla correcta (excluye
-- Bloqueado e Inactivo por igual). Lo que hace esta issue es tomar dueño de
-- la función —documentarla como definitiva, no como placeholder— para que
-- Ventas (S3-0x) la siga consultando tal cual, sin que nadie más la toque.
--
-- @param p_cliente uuid del cliente.
-- @returns boolean true sólo si el cliente está Activo.
create or replace function public.cliente_habilitado_para_vender(p_cliente uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(
    (select estado = 'Activo' from public.clientes where id = p_cliente),
    false
  );
$$;

revoke all on function public.cliente_habilitado_para_vender(uuid) from public;
grant execute on function public.cliente_habilitado_para_vender(uuid) to authenticated;

commit;

-- Fin migración 0035
