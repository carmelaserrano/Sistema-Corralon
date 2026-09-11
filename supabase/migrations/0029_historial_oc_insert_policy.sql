-- ============================================================
-- 0023 — Policy de INSERT y columna de email para historial_modificaciones_oc
-- ============================================================

-- 1. Columna para guardar el email del usuario (ya que auth.users no es
--    accesible via PostgREST desde el cliente)
ALTER TABLE historial_modificaciones_oc
  ADD COLUMN IF NOT EXISTS modificado_por_email text;

-- 2. Policy de INSERT para usuarios autenticados (necesaria para que el
--    frontend registre cambios de ítems directamente)
CREATE POLICY "historial_oc_insert"
  ON historial_modificaciones_oc
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 3. Actualizamos el trigger para que también registre el email
CREATE OR REPLACE FUNCTION trg_oc_registrar_modificacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid   uuid := auth.uid();
  email text := (SELECT u.email FROM auth.users u WHERE u.id = uid);
BEGIN
  IF OLD.proveedor_id IS DISTINCT FROM NEW.proveedor_id THEN
    INSERT INTO historial_modificaciones_oc
      (orden_id, campo, valor_anterior, valor_nuevo, modificado_por, modificado_por_email)
    VALUES (NEW.id, 'proveedor_id', OLD.proveedor_id::text, NEW.proveedor_id::text, uid, email);
  END IF;

  IF OLD.deposito_destino_id IS DISTINCT FROM NEW.deposito_destino_id THEN
    INSERT INTO historial_modificaciones_oc
      (orden_id, campo, valor_anterior, valor_nuevo, modificado_por, modificado_por_email)
    VALUES (NEW.id, 'deposito_destino_id', OLD.deposito_destino_id::text, NEW.deposito_destino_id::text, uid, email);
  END IF;

  IF OLD.condicion_pago IS DISTINCT FROM NEW.condicion_pago THEN
    INSERT INTO historial_modificaciones_oc
      (orden_id, campo, valor_anterior, valor_nuevo, modificado_por, modificado_por_email)
    VALUES (NEW.id, 'condicion_pago', OLD.condicion_pago, NEW.condicion_pago, uid, email);
  END IF;

  IF OLD.fecha_entrega_estimada IS DISTINCT FROM NEW.fecha_entrega_estimada THEN
    INSERT INTO historial_modificaciones_oc
      (orden_id, campo, valor_anterior, valor_nuevo, modificado_por, modificado_por_email)
    VALUES (NEW.id, 'fecha_entrega_estimada', OLD.fecha_entrega_estimada::text, NEW.fecha_entrega_estimada::text, uid, email);
  END IF;

  IF OLD.observaciones IS DISTINCT FROM NEW.observaciones THEN
    INSERT INTO historial_modificaciones_oc
      (orden_id, campo, valor_anterior, valor_nuevo, modificado_por, modificado_por_email)
    VALUES (NEW.id, 'observaciones', OLD.observaciones, NEW.observaciones, uid, email);
  END IF;

  RETURN NEW;
END;
$$;
