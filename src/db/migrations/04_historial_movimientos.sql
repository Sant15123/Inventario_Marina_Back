-- ====================================================================
-- Migración 04: Tabla de Historial de Movimientos y Trazabilidad (SIGA)
-- Fundación Marina Orth
-- ====================================================================

CREATE TABLE IF NOT EXISTS historial_movimientos (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(50) NOT NULL, -- 'Devolución', 'Préstamo', 'Entrega', 'Baja', 'Actualización', 'Ingreso'
  elemento_nombre VARCHAR(255) NOT NULL,
  placa_o_id VARCHAR(100),
  cantidad INT DEFAULT 1,
  responsable VARCHAR(255),
  sede VARCHAR(100) DEFAULT 'Medellín',
  fecha TIMESTAMPTZ DEFAULT NOW(),
  detalles TEXT,
  usuario_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices optimizados para auditoría cronológica y filtros
CREATE INDEX IF NOT EXISTS idx_historial_fecha ON historial_movimientos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_historial_placa ON historial_movimientos(placa_o_id);
CREATE INDEX IF NOT EXISTS idx_historial_tipo ON historial_movimientos(tipo);
CREATE INDEX IF NOT EXISTS idx_historial_responsable ON historial_movimientos(responsable);
