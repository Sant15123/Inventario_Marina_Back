-- ====================================================================
-- Migración 06: Función RPC para métricas rápidas del Dashboard
-- ====================================================================

CREATE OR REPLACE FUNCTION obtener_kpis_dashboard(p_sede TEXT DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result json;
BEGIN
  SELECT json_build_object(
    'totalMateriales', (
      SELECT COUNT(*) 
      FROM activos 
      WHERE (p_sede IS NULL OR p_sede = '' OR LOWER(p_sede) IN ('todas', 'todos') OR LOWER(sede) = LOWER(p_sede))
    ),
    'totalItems', (
      SELECT COUNT(*) 
      FROM activos 
      WHERE (p_sede IS NULL OR p_sede = '' OR LOWER(p_sede) IN ('todas', 'todos') OR LOWER(sede) = LOWER(p_sede))
    ),
    'criticosStock', (
      (
        SELECT COUNT(*) 
        FROM consumibles 
        WHERE disponible <= COALESCE(minimo, 5) 
          AND (p_sede IS NULL OR p_sede = '' OR LOWER(p_sede) IN ('todas', 'todos') OR LOWER(ubicacion) ILIKE '%' || LOWER(p_sede) || '%')
      ) +
      (
        SELECT COUNT(*) 
        FROM activos 
        WHERE LOWER(estado) NOT IN ('disponible', 'bueno') 
          AND (p_sede IS NULL OR p_sede = '' OR LOWER(p_sede) IN ('todas', 'todos') OR LOWER(sede) = LOWER(p_sede))
      )
    ),
    'stockCritico', (
      (
        SELECT COUNT(*) 
        FROM consumibles 
        WHERE disponible <= COALESCE(minimo, 5) 
          AND (p_sede IS NULL OR p_sede = '' OR LOWER(p_sede) IN ('todas', 'todos') OR LOWER(ubicacion) ILIKE '%' || LOWER(p_sede) || '%')
      ) +
      (
        SELECT COUNT(*) 
        FROM activos 
        WHERE LOWER(estado) NOT IN ('disponible', 'bueno') 
          AND (p_sede IS NULL OR p_sede = '' OR LOWER(p_sede) IN ('todas', 'todos') OR LOWER(sede) = LOWER(p_sede))
      )
    ),
    'prestamosActivos', (
      SELECT COUNT(*) 
      FROM prestamos 
      WHERE LOWER(estado) = 'activo' 
        AND (p_sede IS NULL OR p_sede = '' OR LOWER(p_sede) IN ('todas', 'todos') OR LOWER(sede) = LOWER(p_sede))
    ),
    'prestamosVencidos', (
      SELECT COUNT(*) 
      FROM prestamos 
      WHERE LOWER(estado) = 'activo' 
        AND fecha_devolucion_esperada IS NOT NULL 
        AND fecha_devolucion_esperada < CURRENT_DATE
        AND (p_sede IS NULL OR p_sede = '' OR LOWER(p_sede) IN ('todas', 'todos') OR LOWER(sede) = LOWER(p_sede))
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
