-- ======================================================================================
-- AUDITORÍA Y DIAGNÓSTICO: DETECCIÓN DE DATOS HUÉRFANOS E INCONSISTENCIAS RELACIONALES
-- SISTEMA INTEGRADO DE GESTIÓN DE ACTIVOS (SIGA) - FUNDACIÓN MARINA ORTH
-- Script de Solo Lectura para Ejecución en Supabase SQL Editor / PostgreSQL
-- ======================================================================================

-- --------------------------------------------------------------------------------------
-- 1. REPORTE EJECUTIVO CONSOLIDADO (Recuento por Tipo de Inconsistencia)
-- --------------------------------------------------------------------------------------
SELECT 
  '1.1 Préstamos con usuario_id huérfano (no existe en perfiles)' AS diagnostico,
  COUNT(*) AS total_filas_huerfanas,
  'ALTA' AS severidad
FROM prestamos p
LEFT JOIN perfiles u ON p.usuario_id = u.id
WHERE p.usuario_id IS NOT NULL AND u.id IS NULL

UNION ALL

SELECT 
  '1.2 Préstamos con solicitante/custodio sin correspondencia en perfiles' AS diagnostico,
  COUNT(*) AS total_filas_huerfanas,
  'MEDIA' AS severidad
FROM prestamos p
LEFT JOIN perfiles u ON (
  (p.usuario_id IS NOT NULL AND p.usuario_id = u.id)
  OR (p.custodio_documento IS NOT NULL AND LOWER(p.custodio_documento) = LOWER(u.documento))
  OR (p.solicitante_documento IS NOT NULL AND LOWER(p.solicitante_documento) = LOWER(u.documento))
  OR (p.solicitante IS NOT NULL AND LOWER(TRIM(p.solicitante)) = LOWER(TRIM(u.nombre_completo)))
)
WHERE u.id IS NULL

UNION ALL

SELECT 
  '1.3 Préstamos con placa o código no existente en catálogo (activos/consumibles/papelería)' AS diagnostico,
  COUNT(*) AS total_filas_huerfanas,
  'CRÍTICA' AS severidad
FROM prestamos p
LEFT JOIN activos a ON LOWER(p.placa_activo) = LOWER(a.placa)
LEFT JOIN consumibles c ON LOWER(p.placa_activo) = LOWER(c.id)
LEFT JOIN papeleria pap ON LOWER(p.placa_activo) = LOWER(pap.id)
WHERE a.placa IS NULL AND c.id IS NULL AND pap.id IS NULL

UNION ALL

SELECT 
  '2.1 Entregas con material_id inexistente en consumibles o papelería' AS diagnostico,
  COUNT(*) AS total_filas_huerfanas,
  'CRÍTICA' AS severidad
FROM entregas_consumibles e
LEFT JOIN consumibles c ON LOWER(e.material_id) = LOWER(c.id)
LEFT JOIN papeleria pap ON LOWER(e.material_id) = LOWER(pap.id)
WHERE c.id IS NULL AND pap.id IS NULL

UNION ALL

SELECT 
  '2.2 Entregas con responsable o custodio sin correspondencia en perfiles' AS diagnostico,
  COUNT(*) AS total_filas_huerfanas,
  'MEDIA' AS severidad
FROM entregas_consumibles e
LEFT JOIN perfiles u ON (
  (e.usuario_id IS NOT NULL AND e.usuario_id = u.id)
  OR (e.responsable_documento IS NOT NULL AND LOWER(e.responsable_documento) = LOWER(u.documento))
  OR (e.custodio_documento IS NOT NULL AND LOWER(e.custodio_documento) = LOWER(u.documento))
  OR (e.responsable IS NOT NULL AND LOWER(TRIM(e.responsable)) = LOWER(TRIM(u.nombre_completo)))
)
WHERE u.id IS NULL

UNION ALL

SELECT 
  '3.1 Items Solicitud sin solicitud_id padre en solicitudes_inventario' AS diagnostico,
  COUNT(*) AS total_filas_huerfanas,
  'CRÍTICA' AS severidad
FROM items_solicitud i
LEFT JOIN solicitudes_inventario s ON i.solicitud_id = s.id
WHERE s.id IS NULL

UNION ALL

SELECT 
  '3.2 Items Solicitud cuyo item_id no existe en activos ni en consumibles' AS diagnostico,
  COUNT(*) AS total_filas_huerfanas,
  'ALTA' AS severidad
FROM items_solicitud i
LEFT JOIN activos a ON i.item_id::text = a.id::text
LEFT JOIN consumibles c ON i.item_id::text = c.id
WHERE i.item_id IS NOT NULL AND a.id IS NULL AND c.id IS NULL

UNION ALL

SELECT 
  '3.3 Solicitudes con usuario_id inexistente en perfiles' AS diagnostico,
  COUNT(*) AS total_filas_huerfanas,
  'ALTA' AS severidad
FROM solicitudes_inventario s
LEFT JOIN perfiles u ON s.usuario_id = u.id
WHERE s.usuario_id IS NOT NULL AND u.id IS NULL

UNION ALL

SELECT 
  '3.4 Solicitudes con proyecto_steam_id inexistente en proyectos_steam' AS diagnostico,
  COUNT(*) AS total_filas_huerfanas,
  'MEDIA' AS severidad
FROM solicitudes_inventario s
LEFT JOIN proyectos_steam ps ON s.proyecto_steam_id = ps.id
WHERE s.proyecto_steam_id IS NOT NULL AND ps.id IS NULL;


-- --------------------------------------------------------------------------------------
-- 2. DETALLE DE PRÉSTAMOS DESALINEADOS O HUÉRFANOS
-- --------------------------------------------------------------------------------------
-- 2.1 Préstamos cuyos solicitantes no tienen match en perfiles:
SELECT 
  p.id AS prestamo_id,
  p.placa_activo,
  p.tipo_item,
  p.solicitante,
  p.solicitante_documento,
  p.custodio_documento,
  p.usuario_id,
  p.sede,
  p.motivo,
  p.fecha_salida,
  p.fecha_devolucion_esperada,
  p.estado
FROM prestamos p
LEFT JOIN perfiles u ON (
  (p.usuario_id IS NOT NULL AND p.usuario_id = u.id)
  OR (p.custodio_documento IS NOT NULL AND LOWER(p.custodio_documento) = LOWER(u.documento))
  OR (p.solicitante_documento IS NOT NULL AND LOWER(p.solicitante_documento) = LOWER(u.documento))
  OR (p.solicitante IS NOT NULL AND LOWER(TRIM(p.solicitante)) = LOWER(TRIM(u.nombre_completo)))
)
WHERE u.id IS NULL
ORDER BY p.id DESC;

-- 2.2 Préstamos cuya placa/código no existe en ninguna tabla de catálogo:
SELECT 
  p.id AS prestamo_id,
  p.placa_activo,
  p.tipo_item,
  p.solicitante,
  p.estado,
  p.fecha_salida
FROM prestamos p
LEFT JOIN activos a ON LOWER(p.placa_activo) = LOWER(a.placa)
LEFT JOIN consumibles c ON LOWER(p.placa_activo) = LOWER(c.id)
LEFT JOIN papeleria pap ON LOWER(p.placa_activo) = LOWER(pap.id)
WHERE a.placa IS NULL AND c.id IS NULL AND pap.id IS NULL;


-- --------------------------------------------------------------------------------------
-- 3. DETALLE DE ENTREGAS DE INSUMOS HUÉRFANAS
-- --------------------------------------------------------------------------------------
-- 3.1 Entregas cuyo material_id no coincide con consumibles ni papelería:
SELECT 
  e.id AS entrega_id,
  e.material_id,
  e.material_nombre,
  e.cantidad,
  e.responsable,
  e.created_at
FROM entregas_consumibles e
LEFT JOIN consumibles c ON LOWER(e.material_id) = LOWER(c.id)
LEFT JOIN papeleria pap ON LOWER(e.material_id) = LOWER(pap.id)
WHERE c.id IS NULL AND pap.id IS NULL;

-- 3.2 Entregas cuyo custodio o responsable no existe en perfiles:
SELECT 
  e.id AS entrega_id,
  e.material_id,
  e.material_nombre,
  e.responsable,
  e.responsable_documento,
  e.custodio_documento,
  e.usuario_id,
  e.created_at
FROM entregas_consumibles e
LEFT JOIN perfiles u ON (
  (e.usuario_id IS NOT NULL AND e.usuario_id = u.id)
  OR (e.responsable_documento IS NOT NULL AND LOWER(e.responsable_documento) = LOWER(u.documento))
  OR (e.custodio_documento IS NOT NULL AND LOWER(e.custodio_documento) = LOWER(u.documento))
  OR (e.responsable IS NOT NULL AND LOWER(TRIM(e.responsable)) = LOWER(TRIM(u.nombre_completo)))
)
WHERE u.id IS NULL;


-- --------------------------------------------------------------------------------------
-- 4. DETALLE DE SOLICITUDES E ÍTEMS HUÉRFANOS
-- --------------------------------------------------------------------------------------
-- 4.1 Ítems en items_solicitud cuya solicitud padre ya no existe:
SELECT 
  i.id AS item_solicitud_id,
  i.solicitud_id,
  i.nombre_item,
  i.tipo_item,
  i.cantidad
FROM items_solicitud i
LEFT JOIN solicitudes_inventario s ON i.solicitud_id = s.id
WHERE s.id IS NULL;

-- 4.2 Solicitudes cuyo proyecto STEAM o usuario apuntan a registros eliminados o inexistentes:
SELECT 
  s.id AS solicitud_id,
  s.usuario_id,
  s.usuario_nombre,
  s.proyecto_steam_id,
  s.tipo_solicitud,
  s.estado,
  s.creado_en
FROM solicitudes_inventario s
LEFT JOIN perfiles u ON s.usuario_id = u.id
LEFT JOIN proyectos_steam ps ON s.proyecto_steam_id = ps.id
WHERE (s.usuario_id IS NOT NULL AND u.id IS NULL)
   OR (s.proyecto_steam_id IS NOT NULL AND ps.id IS NULL);


-- --------------------------------------------------------------------------------------
-- 5. AUDITORÍA DE CLAVES FORÁNEAS (FOREIGN KEYS) Y RESTRICCIONES DE INTEGRIDAD
-- --------------------------------------------------------------------------------------
-- Lista de todas las Foreign Keys explícitas configuradas en la base de datos:
SELECT 
  tc.table_name,
  kcu.column_name,
  tc.constraint_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.update_rule,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;
