-- ============================================================================
-- 0064 · Roles y permisos del sistema
--
-- Hasta ahora `usuarios_internos` + `permisos` + `usuario_permisos` permitían
-- asignar permisos sueltos persona por persona, pero no había un modelo de
-- Roles que agrupe facultades por puesto de trabajo (CA-01). Esta migración:
--
--   1. Agrega `roles` y `rol_permisos`, y la columna `usuarios_internos.rol_id`.
--   2. Extiende `usuario_tiene_permiso()` para que también mire el rol del
--      usuario, SIN tocar su firma ni romper ninguno de los ~20 call sites
--      que ya existen en el frontend y en políticas RLS de otros sprints:
--      solo se agrega un camino adicional (OR), nunca se quita uno.
--   3. Agrega la RPC `obtener_permisos_usuario_actual()` que el frontend usa
--      para armar el menú y bloquear pantallas (CA-02/CA-03/CA-04).
--   4. Cierra un hueco real de CA-05: el dominio de Stock (productos,
--      depósitos, categorías, marcas, unidades, stock_x_deposito, tipos de
--      depósito/movimiento, configuración de stock, movimientos e inventario
--      físico) no tenía NINGÚN permiso granular — cualquier interno podía
--      escribir ahí. Se agrega el permiso `stock.gestionar` y se endurece la
--      escritura (la lectura sigue abierta a cualquier interno: Ventas,
--      Compras y Tesorería necesitan poder leer productos/depósitos/stock
--      para armar una venta o una orden de compra).
--
-- Todos los usuarios internos ya existentes quedan con rol Administrador
-- (backfill explícito más abajo), así que ningún acceso actual se pierde:
-- lo nuevo es que, de acá en adelante, un usuario puede tener un rol más
-- acotado (Vendedor, Encargado de Depósito, Compras / Proveedores, Tesorero).
-- "Cliente Web" NO es un rol interno (CA-01): nunca aparece en esta tabla.
-- ============================================================================

begin;

-- ============================================================================
-- 1. ROLES
-- ============================================================================

create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  descripcion text,
  created_at  timestamptz not null default now()
);

alter table public.roles enable row level security;

drop policy if exists "roles_select_interno" on public.roles;
create policy "roles_select_interno" on public.roles
  for select to authenticated
  using (public.es_usuario_interno());

-- Sin policy de insert/update/delete para 'authenticated' a propósito: el
-- catálogo de roles se administra por migración, igual que `permisos`.

insert into public.roles (nombre, descripcion)
values
  ('Administrador', 'Acceso completo a todos los módulos y configuraciones.'),
  ('Vendedor', 'Clientes, Ventas, Listas de Precio (consulta) y Caja.'),
  ('Encargado de Depósito', 'Stock, Depósitos, Artículos, Movimientos, Inventario y Recepciones.'),
  ('Compras / Proveedores', 'Proveedores, Órdenes de Compra y Recepción OC.'),
  ('Tesorero', 'Facturas Proveedor, Órdenes de Pago, Reportes y Cierres de Caja.')
on conflict (nombre) do nothing;


-- ============================================================================
-- 2. ROL_PERMISOS
-- ============================================================================

create table if not exists public.rol_permisos (
  rol_id      uuid not null references public.roles(id) on delete cascade,
  permiso_id  uuid not null references public.permisos(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (rol_id, permiso_id)
);

alter table public.rol_permisos enable row level security;

drop policy if exists "rol_permisos_select_interno" on public.rol_permisos;
create policy "rol_permisos_select_interno" on public.rol_permisos
  for select to authenticated
  using (public.es_usuario_interno());


-- ============================================================================
-- 3. USUARIOS_INTERNOS.rol_id
-- ============================================================================

alter table public.usuarios_internos
  add column if not exists rol_id uuid references public.roles(id);

-- Backfill: nadie pierde acceso. Todo usuario interno existente (sembrado en
-- 0033_base_sprint3.sql) queda como Administrador hasta que alguien le
-- asigne un rol más acotado a mano.
update public.usuarios_internos
set rol_id = (select id from public.roles where nombre = 'Administrador')
where rol_id is null;

alter table public.usuarios_internos
  alter column rol_id set not null;


-- ============================================================================
-- 4. Auto-asignar a Administrador cada permiso que se cree de ahora en más
-- ============================================================================
-- Así "Administrador: acceso completo a todos los módulos" (CA-01) se cumple
-- también para los permisos que agregue un sprint futuro, sin depender de
-- que esa migración se acuerde de tocar rol_permisos.

create or replace function public.fn_asignar_permiso_nuevo_a_administrador()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.rol_permisos (rol_id, permiso_id)
  select r.id, new.id
  from public.roles r
  where r.nombre = 'Administrador'
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_permiso_nuevo_administrador on public.permisos;
create trigger trg_permiso_nuevo_administrador
  after insert on public.permisos
  for each row execute function public.fn_asignar_permiso_nuevo_a_administrador();

-- Backfill de permisos que ya existían antes de que existiera el trigger.
insert into public.rol_permisos (rol_id, permiso_id)
select (select id from public.roles where nombre = 'Administrador'), p.id
from public.permisos p
on conflict do nothing;


-- ============================================================================
-- 5. Permiso nuevo: stock.gestionar
-- ============================================================================
-- Único permiso nuevo de esta migración. Dispara el trigger de la sección 4
-- (queda asignado a Administrador automáticamente). Cubre la escritura en
-- todo el dominio de Stock; la lectura sigue abierta a cualquier interno
-- (ver sección 9 — Ventas/Compras/Tesorería necesitan leer ese catálogo).

insert into public.permisos (nombre)
values ('stock.gestionar')
on conflict (nombre) do nothing;


-- ============================================================================
-- 6. usuario_tiene_permiso(text) — sumar el camino por rol
-- ============================================================================
-- Misma firma y mismos tres caminos que ya existían (0012_ajuste_manual_
-- inventario.sql): usuario_permisos directo, rol admin/permisos en el JWT.
-- Se agrega un cuarto camino (rol canónico vía rol_permisos). Es un OR más:
-- nadie que ya tuviera un permiso lo pierde, así que ningún caller existente
-- (ni los ~20 en src/modules/**/api/*.js, ni las policies de otros sprints)
-- se ve afectado salvo para ganar acceso nuevo.
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
    or exists (
      select 1
      from public.usuarios_internos ui
      join public.rol_permisos rp on rp.rol_id = ui.rol_id
      join public.permisos p on p.id = rp.permiso_id
      where ui.usuario_id = auth.uid()
        and ui.activo
        and p.nombre = p_nombre
    )
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'rol', '')
      in ('admin', 'administrador')
    or coalesce(auth.jwt() -> 'app_metadata' -> 'permisos', '[]'::jsonb)
      ? p_nombre
  );
$$;

revoke all on function public.usuario_tiene_permiso(text) from public;
grant execute on function public.usuario_tiene_permiso(text) to authenticated;


-- ============================================================================
-- 7. Matriz de roles (CA-01) — asignación a los 4 roles no-administradores
-- ============================================================================
-- Administrador ya tiene todo (sección 4). Acá solo los permisos explícitos
-- de la matriz del issue, reutilizando los permisos que cada sprint anterior
-- ya dejó creados (ninguno nuevo salvo stock.gestionar).

-- Vendedor: Clientes, Ventas, Listas de Precio (consulta) y Caja.
-- "Consulta" de listas de precio no necesita permiso: la lectura ya está
-- abierta a cualquier interno (ver listas_precio_select_interno, 0033).
insert into public.rol_permisos (rol_id, permiso_id)
select (select id from public.roles where nombre = 'Vendedor'), p.id
from public.permisos p
where p.nombre in (
  'clientes.alta', 'clientes.modificar',
  'ventas.registrar', 'ventas.cobrar', 'ventas.entregar', 'ventas.facturar',
  'cajas.abrir', 'cajas.cerrar', 'cajas.operar'
)
on conflict do nothing;

-- Encargado de Depósito: Stock, Depósitos, Artículos, Movimientos,
-- Inventario y Recepciones.
insert into public.rol_permisos (rol_id, permiso_id)
select (select id from public.roles where nombre = 'Encargado de Depósito'), p.id
from public.permisos p
where p.nombre in (
  'stock.gestionar', 'Ajuste de inventario',
  'compras.recepcion.registrar', 'compras.recepcion.anular'
)
on conflict do nothing;

-- Compras / Proveedores: Proveedores, Órdenes de Compra y Recepción OC.
insert into public.rol_permisos (rol_id, permiso_id)
select (select id from public.roles where nombre = 'Compras / Proveedores'), p.id
from public.permisos p
where p.nombre in (
  'proveedores.alta', 'proveedores.modificar', 'proveedores.estado',
  'proveedores.rubros.gestionar',
  'compras.solicitud.crear', 'compras.solicitud.aprobar',
  'compras.orden.crear', 'compras.orden.modificar', 'compras.orden.cancelar',
  'compras.recepcion.registrar', 'compras.recepcion.anular',
  'compras.devolucion.registrar'
)
on conflict do nothing;

-- Tesorero: Facturas Proveedor, Órdenes de Pago, Reportes y Cierres de Caja.
-- "Reportes" (pantalla de Stock) es de solo lectura, abierta a cualquier
-- interno; no requiere permiso propio.
insert into public.rol_permisos (rol_id, permiso_id)
select (select id from public.roles where nombre = 'Tesorero'), p.id
from public.permisos p
where p.nombre in (
  'tesoreria.factura.registrar', 'tesoreria.factura.anular',
  'tesoreria.pago.registrar', 'tesoreria.pago.anular',
  'tesoreria.nota_credito.registrar',
  'cajas.administrar', 'cajas.cerrar'
)
on conflict do nothing;


-- ============================================================================
-- 8. RPC obtener_permisos_usuario_actual()
-- ============================================================================
-- Única fuente de verdad que consume el frontend (AuthContext) tras el
-- login: reusa es_usuario_interno() y usuario_tiene_permiso() permiso por
-- permiso, así que el menú jamás puede mostrar algo que el backend después
-- rechace (misma lógica en los dos lugares, no una copia que se puede
-- desincronizar).
create or replace function public.obtener_permisos_usuario_actual()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'interno', public.es_usuario_interno(),
    'rol', (
      select r.nombre
      from public.usuarios_internos ui
      join public.roles r on r.id = ui.rol_id
      where ui.usuario_id = auth.uid() and ui.activo
    ),
    'permisos', coalesce((
      select jsonb_agg(p.nombre order by p.nombre)
      from public.permisos p
      where public.usuario_tiene_permiso(p.nombre)
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.obtener_permisos_usuario_actual() from public;
grant execute on function public.obtener_permisos_usuario_actual() to authenticated;


-- ============================================================================
-- 9. RLS · Dominio de Stock — separar lectura (abierta) de escritura
--    (stock.gestionar). CA-05.
-- ============================================================================
-- Estas 9 tablas tenían una sola policy FOR ALL "<tabla>: acceso
-- autenticados" con using/check en es_usuario_interno() (0001/0002,
-- reescrita por el loop de 0033_base_sprint3.sql). Cualquier interno podía
--  insertar/actualizar/borrar ahí sin ningún permiso específico.
--
-- La lectura NO se toca: Ventas lee productos/depositos para armar una
-- venta, Compras lee productos para una orden de compra, etc. — todos
-- siguen viendo el catálogo. Solo la escritura pasa a requerir
-- stock.gestionar. `productos` además acepta `ecommerce.publicar` en su
-- UPDATE porque PublicacionWebPage actualiza publicado_web/imagen_url
-- directamente sobre la tabla (ver src/modules/ecommerce/api/catalogoApi.js)
-- y ese permiso no tiene por qué estar atado a stock.gestionar.
do $$
declare
  t text;
  tablas text[] := array[
    'categorias', 'marcas', 'unidades_medida', 'tipos_deposito', 'depositos',
    'productos', 'stock_x_deposito', 'tipos_movimiento', 'configuracion_stock'
  ];
  v_update_check text;
begin
  foreach t in array tablas loop
    execute format('drop policy if exists %I on public.%I', t || ': acceso autenticados', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.es_usuario_interno())',
      t || '_select_interno', t
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.usuario_tiene_permiso(''stock.gestionar''))',
      t || '_insert_stock_gestionar', t
    );

    v_update_check := case when t = 'productos'
      then 'public.usuario_tiene_permiso(''stock.gestionar'') or public.usuario_tiene_permiso(''ecommerce.publicar'')'
      else 'public.usuario_tiene_permiso(''stock.gestionar'')'
    end;

    execute format(
      'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      t || '_update_stock_gestionar', t, v_update_check, v_update_check
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.usuario_tiene_permiso(''stock.gestionar''))',
      t || '_delete_stock_gestionar', t
    );
  end loop;
end $$;


-- ============================================================================
-- 10. RLS · movimientos_stock — exigir stock.gestionar en el alta
-- ============================================================================
-- Conserva intacto el chequeo adicional de 'Ajuste de inventario' para
-- movimientos tipo 'ajuste' (0012_ajuste_manual_inventario.sql); solo suma
-- que CUALQUIER alta (ingreso/egreso/transferencia/ajuste) necesita además
-- stock.gestionar. Encargado de Depósito y Administrador tienen ambos
-- permisos (sección 7 y 4), así que no pierden nada.
drop policy if exists "movimientos_stock_insert_authenticated" on public.movimientos_stock;
create policy "movimientos_stock_insert_authenticated"
  on public.movimientos_stock for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.usuario_tiene_permiso('stock.gestionar')
    and (
      tipo_movimiento_id not in (select tm.id from public.tipos_movimiento tm where tm.codigo = 'ajuste')
      or public.usuario_tiene_permiso('Ajuste de inventario')
    )
  );


-- ============================================================================
-- 11. RLS · inventario_fisico / detalle_inventario_fisico — exigir
--     stock.gestionar para abrir/cargar un conteo
-- ============================================================================
-- iniciar_inventario_fisico() y cargar_conteos_inventario() (0008) son
-- SECURITY INVOKER: corren con las policies del que llama, así que
-- endurecer estas policies alcanza (no hace falta tocar esas funciones).
drop policy if exists "inventario_fisico_insert_authenticated" on public.inventario_fisico;
create policy "inventario_fisico_insert_authenticated"
  on public.inventario_fisico for insert to authenticated
  with check (created_by = auth.uid() and public.usuario_tiene_permiso('stock.gestionar'));

drop policy if exists "inventario_fisico_update_authenticated" on public.inventario_fisico;
create policy "inventario_fisico_update_authenticated"
  on public.inventario_fisico for update to authenticated
  using (public.usuario_tiene_permiso('stock.gestionar'))
  with check (public.usuario_tiene_permiso('stock.gestionar'));

drop policy if exists "detalle_inventario_insert_authenticated" on public.detalle_inventario_fisico;
create policy "detalle_inventario_insert_authenticated"
  on public.detalle_inventario_fisico for insert to authenticated
  with check (
    public.usuario_tiene_permiso('stock.gestionar')
    and exists (
      select 1 from public.inventario_fisico i
      where i.id = inventario_fisico_id and i.estado = 'en_carga'
    )
  );

drop policy if exists "detalle_inventario_update_authenticated" on public.detalle_inventario_fisico;
create policy "detalle_inventario_update_authenticated"
  on public.detalle_inventario_fisico for update to authenticated
  using (
    public.usuario_tiene_permiso('stock.gestionar')
    and exists (
      select 1 from public.inventario_fisico i
      where i.id = inventario_fisico_id and i.estado = 'en_carga'
    )
  )
  with check (
    public.usuario_tiene_permiso('stock.gestionar')
    and exists (
      select 1 from public.inventario_fisico i
      where i.id = inventario_fisico_id and i.estado = 'en_carga'
    )
  );


-- ============================================================================
-- 12. Hallazgo de seguridad (CA-05) · crear_movimiento_multiarticulo()
-- ============================================================================
-- Esta función es SECURITY DEFINER (0016_movimiento_multiarticulo.sql): no
-- pasa por las policies de la sección 10, las evita por completo. Antes de
-- esta migración solo validaba `auth.uid() is not null` — es decir que
-- CUALQUIER autenticado (incluido un cliente web registrado en /tienda)
-- podía invocar la RPC directamente y crear movimientos de stock reales,
-- sin pasar por el Sidebar ni por ninguna pantalla. Se agrega el mismo
-- chequeo de permiso que ya exige la policy declarativa, para que ambos
-- caminos (RLS directa y esta RPC) queden consistentes. Misma firma: ningún
-- caller existente (movimientosApi.js) se ve afectado.
create or replace function public.crear_movimiento_multiarticulo(
  p_tipo text,
  p_deposito_id uuid,
  p_items jsonb,
  p_deposito_destino_id uuid default null,
  p_comprobante text default null,
  p_observaciones text default null
)
returns setof public.movimientos_stock
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tipo_id uuid;
  v_codigo text := lower(btrim(coalesce(p_tipo, '')));
  v_movimiento_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesion' using errcode = '42501';
  end if;
  if not public.usuario_tiene_permiso('stock.gestionar') then
    raise exception 'No tiene permiso para registrar movimientos de stock' using errcode = '42501';
  end if;
  if p_deposito_id is null then
    raise exception 'El deposito es obligatorio' using errcode = 'MV001';
  end if;
  if v_codigo not in ('ingreso', 'egreso', 'transferencia') then
    raise exception 'El tipo de movimiento no es valido' using errcode = 'MV007';
  end if;
  if v_codigo = 'transferencia'
    and (p_deposito_destino_id is null or p_deposito_destino_id = p_deposito_id) then
    raise exception 'La transferencia requiere otro deposito destino'
      using errcode = 'MV001';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'Agregue al menos un articulo al movimiento'
      using errcode = 'MV005';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as i(producto_id uuid, cantidad numeric)
    where i.producto_id is null or i.cantidad is null
      or i.cantidad <= 0 or i.cantidad <> trunc(i.cantidad)
  ) then
    raise exception 'Todos los articulos deben tener una cantidad entera mayor a 0'
      using errcode = 'MV008';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as i(producto_id uuid, cantidad numeric)
    group by i.producto_id having count(*) > 1
  ) then
    raise exception 'No se puede repetir un articulo en el movimiento'
      using errcode = 'MV008';
  end if;

  select id into v_tipo_id from public.tipos_movimiento where codigo = v_codigo;
  if v_tipo_id is null then
    raise exception 'El tipo de movimiento no existe' using errcode = 'MV007';
  end if;

  insert into public.movimientos_stock (
    tipo_movimiento_id, deposito_origen_id, deposito_destino_id,
    comprobante, observaciones, created_by, updated_by
  ) values (
    v_tipo_id,
    case when v_codigo in ('egreso', 'transferencia') then p_deposito_id end,
    case when v_codigo = 'ingreso' then p_deposito_id
         when v_codigo = 'transferencia' then p_deposito_destino_id end,
    nullif(btrim(coalesce(p_comprobante, '')), ''),
    nullif(btrim(coalesce(p_observaciones, '')), ''),
    auth.uid(), auth.uid()
  ) returning id into v_movimiento_id;

  insert into public.detalle_movimiento (movimiento_id, producto_id, cantidad)
  select v_movimiento_id, i.producto_id, i.cantidad
  from jsonb_to_recordset(p_items) as i(producto_id uuid, cantidad numeric);

  perform public.confirmar_movimiento(v_movimiento_id);
  return query select * from public.movimientos_stock where id = v_movimiento_id;
end;
$$;

alter function public.crear_movimiento_multiarticulo(text, uuid, jsonb, uuid, text, text)
  owner to postgres;
revoke all on function public.crear_movimiento_multiarticulo(text, uuid, jsonb, uuid, text, text)
  from public;
grant execute on function public.crear_movimiento_multiarticulo(text, uuid, jsonb, uuid, text, text)
  to authenticated;

commit;
