begin;

insert into public.permisos (nombre)
values
  ('cajas.abrir'),
  ('cajas.cerrar'),
  ('cajas.operar'),
  ('cajas.administrar')
on conflict (nombre) do nothing;

create table public.cajas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  punto_venta_id uuid not null references public.puntos_venta(id) on delete restrict,
  usuario_asignado_id uuid references public.usuarios_internos(usuario_id) on delete restrict,
  activa boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_caja_nombre check (length(btrim(nombre)) between 1 and 100)
);

create table public.sesiones_caja (
  id uuid primary key default gen_random_uuid(),
  caja_id uuid not null references public.cajas(id) on delete restrict,
  usuario_id uuid not null references public.usuarios_internos(usuario_id) on delete restrict,
  estado text not null default 'abierta',
  saldo_inicial numeric(14,2) not null,
  abierta_at timestamptz not null default now(),
  cerrada_at timestamptz,
  cerrada_by uuid references auth.users(id),
  monto_declarado numeric(14,2),
  saldo_teorico numeric(14,2),
  diferencia numeric(14,2),
  constraint chk_sesion_caja_estado check (estado in ('abierta', 'cerrada')),
  constraint chk_sesion_caja_saldo_inicial check (saldo_inicial >= 0),
  constraint chk_sesion_caja_cierre check (
    (estado = 'abierta' and cerrada_at is null and cerrada_by is null
      and monto_declarado is null and saldo_teorico is null and diferencia is null)
    or
    (estado = 'cerrada' and cerrada_at is not null and cerrada_by is not null
      and monto_declarado is not null and saldo_teorico is not null and diferencia is not null)
  )
);

create table public.movimientos_caja (
  id uuid primary key default gen_random_uuid(),
  sesion_caja_id uuid not null references public.sesiones_caja(id) on delete restrict,
  tipo text not null,
  origen text not null,
  medio_pago_id uuid not null references public.medios_pago(id) on delete restrict,
  monto numeric(14,2) not null,
  motivo text not null,
  comprobante text,
  venta_id uuid references public.ventas(id) on delete restrict,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint chk_movimiento_caja_tipo check (tipo in ('ingreso', 'egreso')),
  constraint chk_movimiento_caja_origen check (origen in ('venta', 'manual')),
  constraint chk_movimiento_caja_monto check (monto > 0),
  constraint chk_movimiento_caja_motivo check (length(btrim(motivo)) > 0),
  constraint chk_movimiento_caja_origen_venta check (
    (origen = 'venta' and venta_id is not null and tipo = 'ingreso')
    or (origen = 'manual' and venta_id is null and comprobante is not null)
  )
);

create index idx_sesiones_caja_caja_estado
  on public.sesiones_caja (caja_id, estado);
create index idx_movimientos_caja_sesion_fecha
  on public.movimientos_caja (sesion_caja_id, created_at);
create unique index uq_sesion_caja_abierta_por_caja
  on public.sesiones_caja (caja_id) where estado = 'abierta';
create unique index uq_sesion_caja_abierta_por_usuario
  on public.sesiones_caja (usuario_id) where estado = 'abierta';

alter table public.cobros_venta
  add column sesion_caja_id uuid references public.sesiones_caja(id) on delete restrict;

alter table public.cajas enable row level security;
alter table public.sesiones_caja enable row level security;
alter table public.movimientos_caja enable row level security;

create policy "cajas_select" on public.cajas
  for select to authenticated
  using (
    public.usuario_tiene_permiso('cajas.administrar')
    or (
      (
        public.usuario_tiene_permiso('cajas.operar')
        or public.usuario_tiene_permiso('cajas.abrir')
        or public.usuario_tiene_permiso('cajas.cerrar')
      )
      and (
        usuario_asignado_id = auth.uid()
        or exists (
          select 1 from public.sesiones_caja sc
          where sc.caja_id = cajas.id
            and sc.usuario_id = auth.uid()
        )
      )
    )
  );

create policy "cajas_insert_admin" on public.cajas
  for insert to authenticated
  with check (public.usuario_tiene_permiso('cajas.administrar'));

create policy "cajas_update_admin" on public.cajas
  for update to authenticated
  using (public.usuario_tiene_permiso('cajas.administrar'))
  with check (public.usuario_tiene_permiso('cajas.administrar'));

create policy "sesiones_caja_select" on public.sesiones_caja
  for select to authenticated
  using (
    public.usuario_tiene_permiso('cajas.administrar')
    or (
      usuario_id = auth.uid()
      and (
        public.usuario_tiene_permiso('cajas.operar')
        or public.usuario_tiene_permiso('cajas.abrir')
        or public.usuario_tiene_permiso('cajas.cerrar')
      )
    )
  );

create policy "movimientos_caja_select" on public.movimientos_caja
  for select to authenticated
  using (
    public.usuario_tiene_permiso('cajas.administrar')
    or exists (
      select 1 from public.sesiones_caja sc
      where sc.id = movimientos_caja.sesion_caja_id
        and sc.usuario_id = auth.uid()
        and (
          public.usuario_tiene_permiso('cajas.operar')
          or public.usuario_tiene_permiso('cajas.cerrar')
        )
    )
  );

revoke all on public.cajas, public.sesiones_caja, public.movimientos_caja
  from anon, authenticated;
grant select on public.cajas, public.sesiones_caja, public.movimientos_caja
  to authenticated;
grant insert, update on public.cajas to authenticated;

create or replace function public.bloquear_modificacion_movimiento_caja()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Los movimientos de caja son inmutables'
    using errcode = 'CX007';
end;
$$;

create trigger trg_movimientos_caja_inmutables
before update or delete on public.movimientos_caja
for each row execute function public.bloquear_modificacion_movimiento_caja();

create or replace function public.proteger_sesion_caja_cerrada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado = 'cerrada' then
    raise exception 'La sesión de caja cerrada es inmutable'
      using errcode = 'CX007';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Las sesiones de caja no se pueden eliminar'
      using errcode = 'CX007';
  end if;
  return new;
end;
$$;

create trigger trg_sesiones_caja_inmutables
before update or delete on public.sesiones_caja
for each row execute function public.proteger_sesion_caja_cerrada();

create or replace function public.proteger_caja_con_sesion_activa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.activa and (
    not new.activa
    or new.punto_venta_id is distinct from old.punto_venta_id
    or new.usuario_asignado_id is distinct from old.usuario_asignado_id
  ) and exists (
    select 1 from public.sesiones_caja sc
    where sc.caja_id = old.id and sc.estado = 'abierta'
  ) then
    raise exception 'No se puede desactivar o reasignar una caja con sesión abierta'
      using errcode = 'CX003';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_cajas_proteger_sesion_activa
before update on public.cajas
for each row execute function public.proteger_caja_con_sesion_activa();

create or replace function public.validar_caja_asignacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.puntos_venta pv
    where pv.id = new.punto_venta_id and pv.activo
  ) then
    raise exception 'El punto de venta no existe o está inactivo'
      using errcode = 'CX002';
  end if;
  if new.usuario_asignado_id is not null and not exists (
    select 1 from public.usuarios_internos ui
    where ui.usuario_id = new.usuario_asignado_id and ui.activo
  ) then
    raise exception 'El cajero asignado no existe o está inactivo'
      using errcode = 'CX002';
  end if;
  return new;
end;
$$;

create trigger trg_cajas_validar_asignacion
before insert or update of punto_venta_id, usuario_asignado_id on public.cajas
for each row execute function public.validar_caja_asignacion();

create or replace function public.listar_cajeros()
returns table (usuario_id uuid, nombre text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.usuario_tiene_permiso('cajas.administrar') then
    raise exception 'No tiene permiso para administrar cajas'
      using errcode = '42501';
  end if;

  return query
  select ui.usuario_id, ui.nombre
  from public.usuarios_internos ui
  where ui.activo
  order by ui.nombre;
end;
$$;

create or replace function public.abrir_caja(
  p_caja_id uuid,
  p_saldo_inicial numeric
)
returns public.sesiones_caja
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_caja public.cajas%rowtype;
  v_sesion public.sesiones_caja%rowtype;
begin
  if v_usuario is null or not public.usuario_tiene_permiso('cajas.abrir') then
    raise exception 'No tiene permiso para abrir cajas' using errcode = '42501';
  end if;
  if p_caja_id is null or p_saldo_inicial is null or p_saldo_inicial < 0 then
    raise exception 'La caja y un saldo inicial no negativo son obligatorios'
      using errcode = 'CX001';
  end if;

  select * into v_caja
  from public.cajas
  where id = p_caja_id
  for update;

  if not found or not v_caja.activa
     or v_caja.usuario_asignado_id is distinct from v_usuario then
    raise exception 'La caja no existe, está inactiva o no está asignada al cajero'
      using errcode = 'CX002';
  end if;

  insert into public.sesiones_caja (caja_id, usuario_id, saldo_inicial)
  values (p_caja_id, v_usuario, p_saldo_inicial)
  returning * into v_sesion;

  return v_sesion;
exception
  when unique_violation then
    raise exception 'La caja o el cajero ya tiene una sesión abierta'
      using errcode = 'CX003';
end;
$$;

create or replace function public.cerrar_caja(
  p_sesion_caja_id uuid,
  p_monto_declarado numeric
)
returns public.sesiones_caja
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_sesion public.sesiones_caja%rowtype;
  v_saldo_teorico numeric(14,2);
begin
  if v_usuario is null or not public.usuario_tiene_permiso('cajas.cerrar') then
    raise exception 'No tiene permiso para cerrar cajas' using errcode = '42501';
  end if;
  if p_sesion_caja_id is null or p_monto_declarado is null or p_monto_declarado < 0 then
    raise exception 'La sesión y un monto declarado no negativo son obligatorios'
      using errcode = 'CX001';
  end if;

  select * into v_sesion
  from public.sesiones_caja
  where id = p_sesion_caja_id
    and usuario_id = v_usuario
    and estado = 'abierta'
  for update;

  if not found then
    raise exception 'La sesión no existe, no está abierta o no pertenece al cajero'
      using errcode = 'CX002';
  end if;

  select (
    v_sesion.saldo_inicial
    + coalesce(sum(case when mc.tipo = 'ingreso' then mc.monto else -mc.monto end), 0)
  )::numeric(14,2)
  into v_saldo_teorico
  from public.movimientos_caja mc
  join public.medios_pago mp on mp.id = mc.medio_pago_id
  where mc.sesion_caja_id = v_sesion.id
    and lower(mp.nombre) = 'efectivo';

  update public.sesiones_caja
  set estado = 'cerrada',
      cerrada_at = now(),
      cerrada_by = v_usuario,
      monto_declarado = p_monto_declarado,
      saldo_teorico = v_saldo_teorico,
      diferencia = (p_monto_declarado - v_saldo_teorico)::numeric(14,2)
  where id = v_sesion.id
  returning * into v_sesion;

  return v_sesion;
end;
$$;

create or replace function public.registrar_movimiento_caja(
  p_tipo text,
  p_medio_pago_id uuid,
  p_monto numeric,
  p_motivo text,
  p_comprobante text
)
returns public.movimientos_caja
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_sesion public.sesiones_caja%rowtype;
  v_movimiento public.movimientos_caja%rowtype;
begin
  if v_usuario is null or not public.usuario_tiene_permiso('cajas.operar') then
    raise exception 'No tiene permiso para operar cajas' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in ('ingreso', 'egreso')
     or p_medio_pago_id is null
     or p_monto is null or p_monto <= 0
     or p_motivo is null or length(btrim(p_motivo)) = 0
     or p_comprobante is null or length(btrim(p_comprobante)) = 0
     or length(btrim(p_motivo)) > 300
     or length(btrim(p_comprobante)) > 200 then
    raise exception 'Tipo, medio, importe, motivo y comprobante son obligatorios y deben ser válidos'
      using errcode = 'CX001';
  end if;
  if not exists (
    select 1 from public.medios_pago mp
    where mp.id = p_medio_pago_id and mp.activo
  ) then
    raise exception 'El medio de pago no existe o está inactivo'
      using errcode = 'CX002';
  end if;

  select * into v_sesion
  from public.sesiones_caja
  where usuario_id = v_usuario and estado = 'abierta'
  for update;

  if not found then
    raise exception 'No hay una sesión de caja abierta para este cajero'
      using errcode = 'CX002';
  end if;

  insert into public.movimientos_caja (
    sesion_caja_id, tipo, origen, medio_pago_id, monto, motivo,
    comprobante, created_by
  ) values (
    v_sesion.id, p_tipo, 'manual', p_medio_pago_id, p_monto,
    btrim(p_motivo), btrim(p_comprobante), v_usuario
  )
  returning * into v_movimiento;

  return v_movimiento;
end;
$$;

create or replace function public.asociar_sesion_caja_a_cobro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := coalesce(new.created_by, auth.uid());
  v_sesion_id uuid;
begin
  if v_usuario is null or not public.usuario_tiene_permiso('cajas.operar') then
    raise exception 'No tiene permiso para operar una caja'
      using errcode = '42501';
  end if;

  select sc.id into v_sesion_id
  from public.sesiones_caja sc
  where sc.usuario_id = v_usuario and sc.estado = 'abierta'
  for update;

  if v_sesion_id is null then
    raise exception 'Debe abrir una caja antes de registrar un cobro'
      using errcode = 'CV008';
  end if;

  new.sesion_caja_id := v_sesion_id;
  return new;
end;
$$;

create trigger trg_cobros_venta_sesion_caja
before insert on public.cobros_venta
for each row execute function public.asociar_sesion_caja_a_cobro();

create or replace function public.registrar_movimiento_por_detalle_cobro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cobro record;
begin
  select cv.id, cv.sesion_caja_id, cv.numero, cv.venta_id
    into v_cobro
  from public.cobros_venta cv
  where cv.id = new.cobro_id;

  if v_cobro.sesion_caja_id is not null then
    insert into public.movimientos_caja (
      sesion_caja_id, tipo, origen, medio_pago_id, monto, motivo,
      comprobante, venta_id, created_by
    )
    select v_cobro.sesion_caja_id, 'ingreso', 'venta',
           new.medio_pago_id, new.monto,
           'Cobro de venta N.º ' || v_cobro.numero,
           new.referencia, v_cobro.venta_id,
           coalesce(auth.uid(), cv.created_by)
    from public.cobros_venta cv
    where cv.id = v_cobro.id;
  end if;
  return new;
end;
$$;

create trigger trg_detalle_cobro_movimiento_caja
after insert on public.detalle_cobro
for each row execute function public.registrar_movimiento_por_detalle_cobro();

revoke all on function public.bloquear_modificacion_movimiento_caja() from public, anon, authenticated;
revoke all on function public.proteger_sesion_caja_cerrada() from public, anon, authenticated;
revoke all on function public.proteger_caja_con_sesion_activa() from public, anon, authenticated;
revoke all on function public.validar_caja_asignacion() from public, anon, authenticated;
revoke all on function public.asociar_sesion_caja_a_cobro() from public, anon, authenticated;
revoke all on function public.registrar_movimiento_por_detalle_cobro() from public, anon, authenticated;
revoke all on function public.listar_cajeros() from public, anon;
revoke all on function public.abrir_caja(uuid, numeric) from public, anon;
revoke all on function public.cerrar_caja(uuid, numeric) from public, anon;
revoke all on function public.registrar_movimiento_caja(text, uuid, numeric, text, text) from public, anon;
grant execute on function public.listar_cajeros() to authenticated;
grant execute on function public.abrir_caja(uuid, numeric) to authenticated;
grant execute on function public.cerrar_caja(uuid, numeric) to authenticated;
grant execute on function public.registrar_movimiento_caja(text, uuid, numeric, text, text) to authenticated;

commit;
