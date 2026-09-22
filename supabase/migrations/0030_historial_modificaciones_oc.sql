-- ============================================================
-- 0022 — Historial de modificaciones de Órdenes de Compra
-- CA 4: usuario, fecha/hora y detalle de qué cambió (valor anterior → nuevo)
-- ============================================================

-- 1. Tabla de auditoría
CREATE TABLE IF NOT EXISTS historial_modificaciones_oc (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id       uuid        NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  campo          text        NOT NULL,
  valor_anterior text,
  valor_nuevo    text,
  modificado_por uuid        REFERENCES auth.users(id),
  modificado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historial_oc_orden
  ON historial_modificaciones_oc (orden_id, modificado_en DESC);

-- 2. RLS
ALTER TABLE historial_modificaciones_oc ENABLE ROW LEVEL SECURITY;

CREATE POLICY "historial_oc_select"
  ON historial_modificaciones_oc
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. Función del trigger
CREATE OR REPLACE FUNCTION trg_oc_registrar_modificacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF OLD.proveedor_id IS DISTINCT FROM NEW.proveedor_id THEN
    INSERT INTO historial_modificaciones_oc
      (orden_id, campo, valor_anterior, valor_nuevo, modificado_por)
    VALUES (NEW.id, 'proveedor_id', OLD.proveedor_id::text, NEW.proveedor_id::text, uid);
  END IF;

  IF OLD.deposito_destino_id IS DISTINCT FROM NEW.deposito_destino_id THEN
    INSERT INTO historial_modificaciones_oc
      (orden_id, campo, valor_anterior, valor_nuevo, modificado_por)
    VALUES (NEW.id, 'deposito_destino_id', OLD.deposito_destino_id::text, NEW.deposito_destino_id::text, uid);
  END IF;

  IF OLD.condicion_pago IS DISTINCT FROM NEW.condicion_pago THEN
    INSERT INTO historial_modificaciones_oc
      (orden_id, campo, valor_anterior, valor_nuevo, modificado_por)
    VALUES (NEW.id, 'condicion_pago', OLD.condicion_pago, NEW.condicion_pago, uid);
  END IF;

  IF OLD.fecha_entrega_estimada IS DISTINCT FROM NEW.fecha_entrega_estimada THEN
    INSERT INTO historial_modificaciones_oc
      (orden_id, campo, valor_anterior, valor_nuevo, modificado_por)
    VALUES (NEW.id, 'fecha_entrega_estimada', OLD.fecha_entrega_estimada::text, NEW.fecha_entrega_estimada::text, uid);
  END IF;

  IF OLD.observaciones IS DISTINCT FROM NEW.observaciones THEN
    INSERT INTO historial_modificaciones_oc
      (orden_id, campo, valor_anterior, valor_nuevo, modificado_por)
    VALUES (NEW.id, 'observaciones', OLD.observaciones, NEW.observaciones, uid);
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Trigger (solo cuando la OC estaba en estado pendiente)
CREATE TRIGGER trg_ordenes_compra_historial_modificacion
  AFTER UPDATE ON ordenes_compra
  FOR EACH ROW
  WHEN (OLD.estado = 'pendiente')
  EXECUTE FUNCTION trg_oc_registrar_modificacion();
