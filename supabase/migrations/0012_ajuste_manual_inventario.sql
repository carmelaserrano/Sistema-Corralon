-- Migracion 0012: ajuste manual de inventario - US-STK-12
--
-- Los ajustes son movimientos inmutables. Un ajuste positivo se modela como
-- un ingreso al deposito y uno negativo como un egreso; de esta forma usa el
-- mismo camino atomico de confirmacion que el resto de los movimientos.

begin;

-- =====================================================================
-- 1) Permiso y datos de auditoria
-- =====================================================================

create table if not exists public.permisos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.usuario_permisos (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  permiso_id uuid not null references public.permisos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (usuario_id, permiso_id)
);

insert into public.permisos (nombre)
values ('Ajuste de inventario')
on conflict (nombre) do nothing;

alter table public.permisos enable row level security;
alter table public.usuario_permisos enable row level security;

create policy "permisos_select_authenticated"
  on public.permisos for select to authenticated using (true);

create policy "usuario_permisos_select_own"
  on public.usuario_permisos for select to authenticated
  using (usuario_id = auth.uid());

-- Además de la asignación explícita, se aceptan permisos provisionados en
-- app_metadata. El rol administrador conserva acceso para instalaciones que
-- todavía no tienen una pantalla de administración de usuarios.
create or replace function public.usuario_tiene_permiso(p_nombre text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    exists (
      select 1
      from public.usuario_permisos up
      join public.permisos p on p.id = up.permiso_id
      where up.usuario_id = auth.uid()
        and p.nombre = p_nombre
    )
    or coalesce(auth.jwt() -> 'app_metadata' -> 'rol', '')::text
      in ('"admin"', '"administrador"')
    or coalesce(auth.jwt() -> 'app_metadata' -> 'permisos', '[]'::jsonb)
      ? p_nombre
  );
$$;

revoke all on function public.usuario_tiene_permiso(text) from public;
grant execute on function public.usuario_tiene_permiso(text) to authenticated;

alter table public.movimientos_stock
  add column if not exists categoria_ajuste text,
  add column if not exists motivo_ajuste text,
  add column if not exists origen_ajuste text,
  add column if not exists inventario_fisico_id uuid
    references public.inventario_fisico(id) on delete restrict;

alter table public.inventario_fisico
  add column if not exists ajustes_aplicados_by uuid references auth.users(id),
  add column if not exists ajustes_aplicados_at timestamptz;

alter table public.movimientos_stock
  drop constraint if exists movimientos_categoria_ajuste_check;
alter table public.movimientos_stock
  add constraint movimientos_categoria_ajuste_check
  check (
    categoria_ajuste is null
    or categoria_ajuste in (
      'rotura', 'vencimiento', 'robo', 'conteo_fisico', 'otro'
    )
  );

alter table public.movimientos_stock
  drop constraint if exists movimientos_motivo_ajuste_no_vacio;
alter table public.movimientos_stock
  add constraint movimientos_motivo_ajuste_no_vacio
  check (motivo_ajuste is null or length(btrim(motivo_ajuste)) > 0);

alter table public.movimientos_stock
  drop constraint if exists movimientos_origen_ajuste_check;
alter table public.movimientos_stock
  add constraint movimientos_origen_ajuste_check
  check (
    origen_ajuste is null
    or origen_ajuste in ('manual', 'inventario_fisico')
  );

create index if not exists idx_movimientos_inventario_fisico
  on public.movimientos_stock (inventario_fisico_id);

-- =====================================================================
-- 2) Tipo y validacion de coherencia
-- =====================================================================

insert into public.tipos_movimiento (nombre, codigo)
values ('Ajuste', 'ajuste')
on conflict (nombre) do update set codigo = excluded.codigo;

create or replace function public.validar_coherencia_movimiento()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_codigo text;
begin
  select tm.codigo into v_codigo
  from public.tipos_movimiento tm
  where tm.id = new.tipo_movimiento_id;

  if v_codigo is null then
    raise exception 'El tipo de movimiento no existe' using errcode = 'MV007';
  end if;

  if v_codigo = 'ingreso' then
    if new.deposito_destino_id is null or new.deposito_origen_id is not null then
      raise exception 'Un ingreso requiere deposito destino y no lleva origen'
        using errcode = 'MV001';
    end if;
  elsif v_codigo = 'egreso' then
    if new.deposito_origen_id is null or new.deposito_destino_id is not null then
      raise exception 'Un egreso requiere deposito origen y no lleva destino'
        using errcode = 'MV001';
    end if;
  elsif v_codigo = 'transferencia' then
    if new.deposito_origen_id is null or new.deposito_destino_id is null then
      raise exception 'Una transferencia requiere deposito origen y destino'
        using errcode = 'MV001';
    end if;
  elsif v_codigo = 'ajuste' then
    if (new.deposito_origen_id is null) = (new.deposito_destino_id is null) then
      raise exception 'Un ajuste requiere exactamente un deposito'
        using errcode = 'MV001';
    end if;
    if new.categoria_ajuste is null
       or new.motivo_ajuste is null
       or new.origen_ajuste is null then
      raise exception 'La categoria, el motivo y el origen del ajuste son obligatorios'
        using errcode = 'AJ001';
    end if;
    if new.origen_ajuste = 'inventario_fisico'
       and new.inventario_fisico_id is null then
      raise exception 'El ajuste de inventario fisico requiere una toma de origen'
        using errcode = 'AJ001';
    end if;
    if new.origen_ajuste = 'manual' and new.inventario_fisico_id is not null then
      raise exception 'Un ajuste manual no puede tener toma de inventario de origen'
        using errcode = 'AJ001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_coherencia_movimiento on public.movimientos_stock;
create trigger trg_validar_coherencia_movimiento
  before insert on public.movimientos_stock
  for each row execute function public.validar_coherencia_movimiento();

-- Los clientes no pueden saltear el permiso usando el INSERT directo.
drop policy if exists "movimientos_stock_insert_authenticated"
  on public.movimientos_stock;
create policy "movimientos_stock_insert_authenticated"
  on public.movimientos_stock for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      tipo_movimiento_id not in (
        select tm.id from public.tipos_movimiento tm where tm.codigo = 'ajuste'
      )
      or public.usuario_tiene_permiso('Ajuste de inventario')
    )
  );

-- =====================================================================
-- 3) Alta manual
-- =====================================================================

create or replace function public.crear_ajuste_inventario(
  p_deposito_id uuid,
  p_producto_id uuid,
  p_cantidad numeric,
  p_categoria text,
  p_motivo text
)
returns setof public.movimientos_stock
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tipo_id uuid;
  v_movimiento_id uuid;
  v_categoria text := lower(btrim(coalesce(p_categoria, '')));
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_disponible numeric;
begin
  if not public.usuario_tiene_permiso('Ajuste de inventario') then
    raise exception 'No tiene permiso para Ajuste de inventario' using errcode = 'AJ002';
  end if;
  if p_deposito_id is null or p_producto_id is null then
    raise exception 'El deposito y el articulo son obligatorios' using errcode = 'AJ001';
  end if;
  if p_cantidad is null or p_cantidad = 0 then
    raise exception 'La cantidad del ajuste debe ser distinta de 0' using errcode = 'AJ001';
  end if;
  if v_categoria not in ('rotura', 'vencimiento', 'robo', 'conteo_fisico', 'otro') then
    raise exception 'La categoria del ajuste no es valida' using errcode = 'AJ001';
  end if;
  if v_motivo is null then
    raise exception 'El motivo del ajuste es obligatorio' using errcode = 'AJ001';
  end if;

  select tm.id into v_tipo_id
  from public.tipos_movimiento tm
  where tm.codigo = 'ajuste';

  if p_cantidad < 0 then
    select cantidad - comprometido into v_disponible
    from public.stock_x_deposito
    where deposito_id = p_deposito_id and producto_id = p_producto_id;
    if coalesce(v_disponible, 0) < abs(p_cantidad) then
      raise exception 'La cantidad supera el disponible del deposito'
        using errcode = 'AJ003';
    end if;
  end if;

  insert into public.movimientos_stock (
    tipo_movimiento_id, deposito_origen_id, deposito_destino_id,
    categoria_ajuste, motivo_ajuste, origen_ajuste
  )
  values (
    v_tipo_id,
    case when p_cantidad < 0 then p_deposito_id end,
    case when p_cantidad > 0 then p_deposito_id end,
    v_categoria, v_motivo, 'manual'
  )
  returning id into v_movimiento_id;

  insert into public.detalle_movimiento (movimiento_id, producto_id, cantidad)
  values (v_movimiento_id, p_producto_id, abs(p_cantidad));

  return query select * from public.movimientos_stock where id = v_movimiento_id;
end;
$$;

revoke all on function public.crear_ajuste_inventario(uuid, uuid, numeric, text, text)
  from public;
grant execute on function public.crear_ajuste_inventario(uuid, uuid, numeric, text, text)
  to authenticated;

-- =====================================================================
-- 4) Aplicacion atomica de diferencias de una toma aprobada
-- =====================================================================

create or replace function public.aplicar_ajustes_inventario_fisico(
  p_inventario_id uuid,
  p_categoria text default 'conteo_fisico',
  p_motivo text default 'Ajuste generado por diferencia de conteo físico'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inventario public.inventario_fisico%rowtype;
  v_detalle record;
  v_tipo_id uuid;
  v_movimiento_id uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_categoria text := lower(btrim(coalesce(p_categoria, '')));
  v_disponible numeric;
  v_total integer := 0;
begin
  if not public.usuario_tiene_permiso('Ajuste de inventario') then
    raise exception 'No tiene permiso para Ajuste de inventario' using errcode = 'AJ002';
  end if;
  if v_motivo is null then
    raise exception 'El motivo del ajuste es obligatorio' using errcode = 'AJ001';
  end if;
  if v_categoria not in ('rotura', 'vencimiento', 'robo', 'conteo_fisico', 'otro') then
    raise exception 'La categoria del ajuste no es valida' using errcode = 'AJ001';
  end if;

  select * into v_inventario
  from public.inventario_fisico
  where id = p_inventario_id
  for update;

  if not found then
    raise exception 'La toma de inventario no existe' using errcode = 'AJ004';
  end if;
  if v_inventario.estado <> 'aprobado' then
    raise exception 'Solo una toma aprobada puede generar ajustes' using errcode = 'AJ005';
  end if;
  if v_inventario.ajustes_aplicados_at is not null then
    raise exception 'Los ajustes de esta toma ya fueron aplicados' using errcode = 'AJ006';
  end if;

  select id into v_tipo_id from public.tipos_movimiento where codigo = 'ajuste';

  for v_detalle in
    select d.producto_id, d.diferencia, d.inventario_fisico_id
    from public.detalle_inventario_fisico d
    where d.inventario_fisico_id = p_inventario_id
      and d.diferencia <> 0
    order by d.producto_id
  loop
    if v_detalle.diferencia < 0 then
      select cantidad - comprometido into v_disponible
      from public.stock_x_deposito
      where deposito_id = v_inventario.deposito_id
        and producto_id = v_detalle.producto_id
      for update;
      if coalesce(v_disponible, 0) < abs(v_detalle.diferencia) then
        raise exception 'La cantidad supera el disponible del deposito'
          using errcode = 'AJ003';
      end if;
    else
      perform pg_advisory_xact_lock(
        hashtext(v_detalle.producto_id::text),
        hashtext(v_inventario.deposito_id::text)
      );
    end if;

    insert into public.movimientos_stock (
      tipo_movimiento_id, deposito_origen_id, deposito_destino_id,
      categoria_ajuste, motivo_ajuste, origen_ajuste, inventario_fisico_id,
      created_by
    )
    values (
      v_tipo_id,
      case when v_detalle.diferencia < 0 then v_inventario.deposito_id end,
      case when v_detalle.diferencia > 0 then v_inventario.deposito_id end,
      v_categoria, v_motivo, 'inventario_fisico', p_inventario_id, auth.uid()
    )
    returning id into v_movimiento_id;

    insert into public.detalle_movimiento (movimiento_id, producto_id, cantidad)
    values (v_movimiento_id, v_detalle.producto_id, abs(v_detalle.diferencia));

    if v_detalle.diferencia < 0 then
      update public.stock_x_deposito
      set cantidad = cantidad - abs(v_detalle.diferencia), updated_at = now()
      where deposito_id = v_inventario.deposito_id
        and producto_id = v_detalle.producto_id;
    else
      insert into public.stock_x_deposito (producto_id, deposito_id, cantidad, updated_at)
      values (v_detalle.producto_id, v_inventario.deposito_id,
              v_detalle.diferencia, now())
      on conflict (producto_id, deposito_id) do update
        set cantidad = stock_x_deposito.cantidad + excluded.cantidad,
            updated_at = now();
    end if;
    update public.movimientos_stock
    set estado_movimiento = 'confirmado'
    where id = v_movimiento_id;
    v_total := v_total + 1;
  end loop;

  update public.inventario_fisico
  set ajustes_aplicados_by = auth.uid(), ajustes_aplicados_at = now()
  where id = p_inventario_id;

  return v_total;
end;
$$;

alter function public.aplicar_ajustes_inventario_fisico(uuid, text, text)
  owner to postgres;
revoke all on function public.aplicar_ajustes_inventario_fisico(uuid, text, text)
  from public;
grant execute on function public.aplicar_ajustes_inventario_fisico(uuid, text, text)
  to authenticated;

commit;
