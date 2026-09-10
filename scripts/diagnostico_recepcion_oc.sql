-- Diagnóstico previo a 0022. Solo lectura: no modifica estructura ni datos.
-- Ejecutar completo en SQL Editor y compartir el resultado JSON.
begin transaction read only;

select jsonb_pretty(jsonb_build_object(
  'columnas', (
    select jsonb_agg(jsonb_build_object(
      'tabla', table_name, 'columna', column_name, 'tipo', data_type,
      'nullable', is_nullable, 'default', column_default, 'identity', is_identity
    ) order by table_name, ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name in (
      'recepciones', 'detalle_recepcion', 'ordenes_compra', 'detalle_orden_compra',
      'movimientos_stock', 'detalle_movimiento', 'stock_x_deposito', 'productos'
    )
  ),
  'constraints', (
    select jsonb_agg(jsonb_build_object('tabla', c.conrelid::regclass::text,
      'nombre', c.conname, 'definicion', pg_get_constraintdef(c.oid), 'validado', c.convalidated))
    from pg_constraint c where c.conrelid in (
      to_regclass('public.recepciones'), to_regclass('public.detalle_recepcion'),
      to_regclass('public.ordenes_compra'), to_regclass('public.detalle_orden_compra'),
      to_regclass('public.movimientos_stock'), to_regclass('public.detalle_movimiento')
    )
  ),
  'funciones_recepcion', (
    select jsonb_agg(jsonb_build_object('firma', p.oid::regprocedure::text,
      'definicion', pg_get_functiondef(p.oid)))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'crear_recepcion', 'confirmar_recepcion', 'registrar_recepcion_oc',
      'fn_validar_cantidad_recibida', 'usuario_tiene_permiso'
    ) and p.prokind = 'f'
  ),
  'triggers', (
    select jsonb_agg(jsonb_build_object('tabla', t.tgrelid::regclass::text,
      'definicion', pg_get_triggerdef(t.oid)))
    from pg_trigger t where not t.tgisinternal and t.tgrelid in (
      to_regclass('public.recepciones'), to_regclass('public.detalle_recepcion'),
      to_regclass('public.ordenes_compra'), to_regclass('public.detalle_orden_compra'),
      to_regclass('public.movimientos_stock'), to_regclass('public.detalle_movimiento')
    )
  ),
  'policies', (
    select jsonb_agg(to_jsonb(p)) from pg_policies p
    where schemaname = 'public' and tablename in ('recepciones', 'detalle_recepcion')
  ),
  'resumen_recepciones', (
    select jsonb_agg(to_jsonb(s)) from (
      select estado_recepcion, count(*) as cantidad,
        count(*) filter (where orden_compra_id is null) as sin_oc,
        count(*) filter (where nullif(btrim(to_jsonb(r)->>'remito_proveedor'), '') is not null) as con_remito
      from public.recepciones r group by estado_recepcion
    ) s
  ),
  'resumen_detalles', (
    select jsonb_build_object('cantidad', count(*),
      'decimales', count(*) filter (where cantidad <> trunc(cantidad)),
      'sin_renglon_oc', count(*) filter (where to_jsonb(d)->>'orden_compra_detalle_id' is null))
    from public.detalle_recepcion d
  )
)) as diagnostico;

commit;
