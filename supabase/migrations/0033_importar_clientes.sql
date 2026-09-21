-- ============================================================================
-- 0033 · S3-04: Importación masiva de clientes desde CSV
--
-- Función importar_clientes(p_filas jsonb): recibe las filas que la pantalla
-- ya validó como "Nuevas" y las inserta en public.clientes con origen
-- 'Importación'.
--
-- Todo o nada (CA-04 / CA-05): una función de PL/pgSQL corre en una única
-- transacción. Cualquier error inesperado (por ejemplo una fila que viole un
-- CHECK de clientes) levanta la excepción, y PostgreSQL revierte todas las
-- filas insertadas hasta ese momento. No hay importaciones parciales.
--
-- Lo que NO aborta, y se cuenta en el resumen:
--   * duplicadas: el documento (tipo + número) ya existe. Cubre tanto a un
--     cliente cargado por otra vía entre la vista previa y la confirmación
--     como a un documento repetido dentro del mismo lote.
--   * con_error: la condición de IVA o el tipo de cliente no existen (o están
--     inactivos). La pantalla ya los valida contra el catálogo, esto cubre el
--     caso de que el catálogo cambie entre la vista previa y la confirmación.
--
-- Seguridad: SECURITY INVOKER. La RLS de clientes se aplica a quien llama y,
-- además, se exige el permiso 'clientes.importar' de forma explícita para
-- devolver un error claro (lección del QA de S3-00: una función no debe
-- asumir que quien la llama está autorizado).
--
-- Forma de cada elemento de p_filas (todas las claves son texto salvo
-- habilita_cta_cte, que es boolean):
--   tipo_persona, nombre, apellido, razon_social, tipo_documento,
--   numero_documento, condicion_iva (nombre), tipo_cliente (nombre),
--   email, telefono, habilita_cta_cte
--
-- @param p_filas jsonb array de objetos con las claves de arriba.
-- @returns jsonb {importadas: int, duplicadas: int, con_error: int}.
-- ============================================================================

begin;

create or replace function public.importar_clientes(p_filas jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_fila            jsonb;
  v_condicion_id    uuid;
  v_tipo_cliente_id uuid;
  v_id              uuid;
  v_importadas      int := 0;
  v_duplicadas      int := 0;
  v_con_error       int := 0;
begin
  if not public.usuario_tiene_permiso('clientes.importar') then
    raise exception 'No tenés permiso para importar clientes'
      using errcode = '42501';
  end if;

  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    raise exception 'p_filas debe ser un array JSON de clientes';
  end if;

  for v_fila in select value from jsonb_array_elements(p_filas)
  loop
    v_condicion_id := null;
    v_tipo_cliente_id := null;
    v_id := null;

    select id into v_condicion_id
    from public.condiciones_iva
    where activo
      and lower(btrim(nombre)) = lower(btrim(v_fila->>'condicion_iva'));

    select id into v_tipo_cliente_id
    from public.tipos_cliente
    where activo
      and lower(btrim(nombre)) = lower(btrim(v_fila->>'tipo_cliente'));

    if v_condicion_id is null or v_tipo_cliente_id is null then
      v_con_error := v_con_error + 1;
      continue;
    end if;

    insert into public.clientes (
      tipo_persona, nombre, apellido, razon_social,
      tipo_documento, numero_documento,
      condicion_iva_id, tipo_cliente_id,
      email, telefono, habilita_cta_cte, origen
    )
    values (
      lower(btrim(v_fila->>'tipo_persona')),
      nullif(btrim(v_fila->>'nombre'), ''),
      nullif(btrim(v_fila->>'apellido'), ''),
      nullif(btrim(v_fila->>'razon_social'), ''),
      upper(btrim(v_fila->>'tipo_documento')),
      btrim(v_fila->>'numero_documento'),
      v_condicion_id,
      v_tipo_cliente_id,
      nullif(btrim(v_fila->>'email'), ''),
      btrim(v_fila->>'telefono'),
      coalesce((v_fila->>'habilita_cta_cte')::boolean, false),
      'Importación'
    )
    on conflict (tipo_documento, numero_documento) do nothing
    returning id into v_id;

    if v_id is null then
      v_duplicadas := v_duplicadas + 1;
    else
      v_importadas := v_importadas + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'importadas', v_importadas,
    'duplicadas', v_duplicadas,
    'con_error', v_con_error
  );
end;
$$;

revoke all on function public.importar_clientes(jsonb) from public;
grant execute on function public.importar_clientes(jsonb) to authenticated;

commit;
