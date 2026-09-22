-- ============================================================================
-- 0036 · S3-06: Descuentos automáticos y descuento manual con autorización
--
-- Reemplaza, con `create or replace` y sin tocar firmas, las tres funciones
-- que S3-00 dejó como versión base:
--   - calcular_precio_venta: ahora aplica el descuento automático de mayor
--     porcentaje (tipo de cliente, categoría o producto — nunca se acumulan).
--   - validar_descuento_manual: ahora compara contra el límite configurado
--     en parametros_ventas.
--   - autorizar_descuento: ahora exige el permiso 'ventas.descuento.autorizar'
--     (a quien llama, que va a ser el supervisor — ver nota en la función).
--
-- autorizacion_descuento_valida (0031) no se toca: ya hace lo que pide esta
-- historia (CA-06). El mensaje claro para "sin permiso / credenciales
-- incorrectas / vencida" lo arma el frontend (ModalAutorizacionDescuento /
-- descuentosApi), no esta función: su contrato es un boolean, no un texto.
--
-- No se toca la 0031 (regla del repo: una migración ya mergeada no se toca).
-- ============================================================================

begin;

-- ============================================================================
-- 1) calcular_precio_venta — CA-02, CA-03
-- ============================================================================
-- Mismo comportamiento base que en 0031 para encontrar el precio de lista
-- (lista del tipo de cliente, o "General" si no hay cliente o no tiene
-- lista asignada). Lo nuevo: antes de devolver el precio, busca la regla de
-- descuento activa de mayor porcentaje entre las tres que puedan aplicar a
-- esta línea (tipo de cliente, categoría del producto, o el producto
-- puntual) y se la resta. Si ninguna aplica, el precio sale igual que antes.
--
-- No se acumulan (CA-02): se usa max(porcentaje), no la suma.
--
-- p_cantidad sigue sin usarse: queda reservada para un descuento por
-- volumen que no es parte de esta historia (ninguna CA lo pide).
--
-- @param p_producto uuid del producto.
-- @param p_cliente uuid del cliente, o null.
-- @param p_cantidad cantidad de la línea (reservada, no usada todavía).
-- @returns numeric precio unitario ya con el descuento aplicado, o null si
--   no hay precio cargado para ese producto en la lista que corresponde.
create or replace function public.calcular_precio_venta(
  p_producto uuid,
  p_cliente uuid,
  p_cantidad numeric default 1
)
returns numeric
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_lista uuid;
  v_precio numeric;
  v_categoria uuid;
  v_tipo_cliente uuid;
  v_descuento_pct numeric;
begin
  if p_cliente is not null then
    select tc.lista_precio_id, tc.id into v_lista, v_tipo_cliente
    from public.clientes c
    join public.tipos_cliente tc on tc.id = c.tipo_cliente_id
    where c.id = p_cliente;
  end if;

  if v_lista is null then
    select id into v_lista
    from public.listas_precio
    where nombre = 'General' and activo;
  end if;

  select precio into v_precio
  from public.precios_lista
  where lista_precio_id = v_lista
    and producto_id = p_producto;

  if v_precio is null then
    return null;
  end if;

  select categoria_id into v_categoria
  from public.productos
  where id = p_producto;

  select max(rd.porcentaje) into v_descuento_pct
  from public.reglas_descuento rd
  where rd.activo
    and (
      (rd.tipo_aplicacion = 'producto' and rd.referencia_id = p_producto)
      or (rd.tipo_aplicacion = 'categoria' and rd.referencia_id = v_categoria)
      or (
        v_tipo_cliente is not null
        and rd.tipo_aplicacion = 'tipo_cliente'
        and rd.referencia_id = v_tipo_cliente
      )
    );

  return round(v_precio * (1 - coalesce(v_descuento_pct, 0) / 100.0), 2);
end;
$$;

revoke all on function public.calcular_precio_venta(uuid, uuid, numeric) from public;
grant execute on function public.calcular_precio_venta(uuid, uuid, numeric) to authenticated;


-- ============================================================================
-- 2) validar_descuento_manual — CA-04
-- ============================================================================
-- El límite vive en parametros_ventas, clave 'limite_descuento_manual',
-- como un número jsonb simple (sin envolver en objeto): lo escribe
-- descuentosApi.setLimiteDescuentoManual con un upsert por `clave`.
--
-- Si todavía no se configuró ningún límite, no exige autorización para
-- nada: mismo comportamiento permisivo que la versión base de S3-00, hasta
-- que alguien con 'precios.gestionar' lo configure desde la pantalla.
--
-- "Lo supera" (CA-04) es estrictamente mayor: un descuento exactamente
-- igual al límite no pide autorización.
--
-- @param p_porcentaje numeric porcentaje de descuento manual solicitado.
-- @returns jsonb {requiere_autorizacion: boolean, limite: numeric|null}.
create or replace function public.validar_descuento_manual(p_porcentaje numeric)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_limite numeric;
begin
  select (valor #>> '{}')::numeric into v_limite
  from public.parametros_ventas
  where clave = 'limite_descuento_manual';

  return jsonb_build_object(
    'requiere_autorizacion', v_limite is not null and p_porcentaje > v_limite,
    'limite', v_limite
  );
end;
$$;

revoke all on function public.validar_descuento_manual(numeric) from public;
grant execute on function public.validar_descuento_manual(numeric) to authenticated;


-- ============================================================================
-- 3) autorizar_descuento — CA-05
-- ============================================================================
-- Mismo cuerpo que la versión base de 0031; lo único nuevo es el chequeo de
-- permiso al principio.
--
-- Quién es "auth.uid()" acá depende de con qué token llegue la llamada, no
-- de esta función: el modal de autorización la invoca desde un cliente de
-- Supabase aparte, autenticado con el email y contraseña del supervisor y
-- sin persistir esa sesión (para no pisar la del vendedor). Autorizar_descuento
-- corre con ESE token, así que auth.uid() ya es el supervisor, y este
-- chequeo valida el permiso de la persona correcta sin ningún parámetro
-- extra en la firma.
--
-- @param p_porcentaje numeric porcentaje a autorizar.
-- @returns uuid id de la autorización creada (válida 5 minutos).
create or replace function public.autorizar_descuento(p_porcentaje numeric)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.usuario_tiene_permiso('ventas.descuento.autorizar') then
    raise exception 'No tenés permiso para autorizar descuentos'
      using errcode = '42501';
  end if;

  insert into public.autorizaciones_descuento (porcentaje, autorizado_por)
  values (p_porcentaje, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.autorizar_descuento(numeric) from public;
grant execute on function public.autorizar_descuento(numeric) to authenticated;

commit;
