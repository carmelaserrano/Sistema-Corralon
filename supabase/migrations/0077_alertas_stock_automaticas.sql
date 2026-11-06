-- ============================================================================
-- 0077 · Alertas de stock mínimo en todos los circuitos
--
-- Hasta ahora la alerta solo se generaba en confirmar_movimiento() (0016): las
-- ventas y los pedidos web reservan y egresan stock por otras funciones, así
-- que nunca avisaban. Tampoco se revisaba al cargar un mínimo.
--
-- Regla única, evaluada por triggers sobre stock_x_deposito y configuracion_stock:
--   · Alerta: el disponible (cantidad - comprometido) cruza hacia abajo el
--     mínimo. Quedar justo en el mínimo no alerta.
--   · Cierre automático: el disponible vuelve a alcanzar el mínimo.
--   · Una alerta atendida con el stock todavía bajo no reaparece: hace falta
--     reponer y volver a cruzar.
--
-- Los triggers no modifican stock. confirmar_movimiento() no cambia: su INSERT
-- queda redundante y el índice de alerta activa única evita duplicados.
-- ============================================================================

begin;

-- p_estaba_bien indica si antes del cambio el disponible alcanzaba el mínimo.
create or replace function public.fn_evaluar_alerta_stock(
  p_producto uuid,
  p_deposito uuid,
  p_disponible numeric,
  p_minimo numeric,
  p_estaba_bien boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_disponible >= p_minimo then
    update public.alertas_stock
       set estado = 'atendida', atendida_at = now()
     where producto_id = p_producto and deposito_id = p_deposito and estado = 'activa';
    return;
  end if;

  -- Sigue por debajo: la alerta activa muestra los valores actuales.
  update public.alertas_stock
     set stock_disponible = p_disponible, stock_minimo = p_minimo
   where producto_id = p_producto and deposito_id = p_deposito and estado = 'activa';

  if p_estaba_bien then
    insert into public.alertas_stock (producto_id, deposito_id, stock_disponible, stock_minimo)
    values (p_producto, p_deposito, p_disponible, p_minimo)
    on conflict (producto_id, deposito_id) where estado = 'activa'
    do nothing;
  end if;
end;
$$;
revoke all on function public.fn_evaluar_alerta_stock(uuid, uuid, numeric, numeric, boolean)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 1. Cambios de stock (reservas, liberaciones, egresos, ingresos, ajustes)
-- ----------------------------------------------------------------------------
create or replace function public.fn_alerta_por_cambio_de_stock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_minimo numeric;
  v_anterior numeric;
begin
  select cs.min_stock into v_minimo
    from public.configuracion_stock cs
   where cs.producto_id = new.producto_id and cs.deposito_id = new.deposito_id;
  if v_minimo is null then return new; end if;

  -- Una fila nueva parte de cero disponible.
  v_anterior := case when tg_op = 'UPDATE' then old.cantidad - old.comprometido else 0 end;
  perform public.fn_evaluar_alerta_stock(
    new.producto_id, new.deposito_id, new.cantidad - new.comprometido, v_minimo, v_anterior >= v_minimo
  );
  return new;
end;
$$;
revoke all on function public.fn_alerta_por_cambio_de_stock() from public, anon, authenticated;

drop trigger if exists trg_stock_alerta_insert on public.stock_x_deposito;
create trigger trg_stock_alerta_insert
  after insert on public.stock_x_deposito
  for each row execute function public.fn_alerta_por_cambio_de_stock();

drop trigger if exists trg_stock_alerta_update on public.stock_x_deposito;
create trigger trg_stock_alerta_update
  after update of cantidad, comprometido on public.stock_x_deposito
  for each row
  when (new.cantidad is distinct from old.cantidad or new.comprometido is distinct from old.comprometido)
  execute function public.fn_alerta_por_cambio_de_stock();

-- ----------------------------------------------------------------------------
-- 2. Carga o cambio del mínimo
-- ----------------------------------------------------------------------------
-- Sin fila de stock el disponible es cero: el artículo igual falta reponer.
create or replace function public.fn_alerta_por_cambio_de_minimo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_disponible numeric;
begin
  select coalesce(max(s.cantidad - s.comprometido), 0) into v_disponible
    from public.stock_x_deposito s
   where s.producto_id = new.producto_id and s.deposito_id = new.deposito_id;

  perform public.fn_evaluar_alerta_stock(
    new.producto_id, new.deposito_id, v_disponible, new.min_stock,
    tg_op = 'INSERT' or v_disponible >= old.min_stock
  );
  return new;
end;
$$;
revoke all on function public.fn_alerta_por_cambio_de_minimo() from public, anon, authenticated;

drop trigger if exists trg_config_stock_alerta_insert on public.configuracion_stock;
create trigger trg_config_stock_alerta_insert
  after insert on public.configuracion_stock
  for each row execute function public.fn_alerta_por_cambio_de_minimo();

drop trigger if exists trg_config_stock_alerta_update on public.configuracion_stock;
create trigger trg_config_stock_alerta_update
  after update of min_stock on public.configuracion_stock
  for each row
  when (new.min_stock is distinct from old.min_stock)
  execute function public.fn_alerta_por_cambio_de_minimo();

-- ----------------------------------------------------------------------------
-- 3. Puesta al día
-- ----------------------------------------------------------------------------
-- No queda registro de si una alerta atendida se repuso en el medio: si el
-- artículo sigue por debajo, se le crea una alerta nueva una sola vez.
do $$
declare
  v_fila record;
begin
  for v_fila in
    select cs.producto_id, cs.deposito_id, cs.min_stock,
           coalesce(s.cantidad - s.comprometido, 0) as disponible
      from public.configuracion_stock cs
      left join public.stock_x_deposito s
        on s.producto_id = cs.producto_id and s.deposito_id = cs.deposito_id
  loop
    perform public.fn_evaluar_alerta_stock(
      v_fila.producto_id, v_fila.deposito_id, v_fila.disponible, v_fila.min_stock, true
    );
  end loop;
end;
$$;

commit;
