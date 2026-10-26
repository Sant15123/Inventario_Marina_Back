-- =========================================================================
-- DEPURACIÓN Y LIMPIEZA DE DATOS DE PRUEBA EN SIGA - FMO
-- Base de Datos: PostgreSQL (Supabase)
-- Transacción segura con verificación de integridad referencial
-- =========================================================================

BEGIN;

-- 1. Eliminar ítems de solicitud asociados a solicitudes ficticias o de prueba
DELETE FROM items_solicitud
WHERE solicitud_id IN (
    SELECT id FROM solicitudes_inventario
    WHERE motivo ILIKE '%prueba%' 
       OR motivo ILIKE '%test%' 
       OR motivo ILIKE '%adsas%'
       OR usuario_nombre ILIKE '%prueba%'
);

-- 2. Eliminar solicitudes de inventario ficticias de prueba
DELETE FROM solicitudes_inventario
WHERE motivo ILIKE '%prueba%' 
   OR motivo ILIKE '%test%' 
   OR motivo ILIKE '%adsas%'
   OR usuario_nombre ILIKE '%prueba%';

-- 3. Eliminar préstamos temporales creados exclusivamente durante tests de desarrollo
DELETE FROM prestamos
WHERE (motivo ILIKE '%Solicitud autorizada: Prueba%'
   OR motivo ILIKE '%betatesting1 - Prueba de flujo%'
   OR motivo ILIKE '%Taller presencial%')
  AND id >= 51;

-- 4. Eliminar registros de mobiliario creados como pruebas rápidas
DELETE FROM mobiliario
WHERE nombre ILIKE '%prueba%' 
   OR nombre ILIKE '%test%' 
   OR nombre ILIKE '%adsas%'
   OR placa IN ('MOB-0001', 'MOB-0002');

-- 5. Eliminar activos tecnológicos ficticios/temporales
DELETE FROM activos
WHERE placa IN ('P57', 'TEST-CHECK')
   OR nombre ILIKE '%prueba equipo%'
   OR nombre ILIKE '%test activo%';

-- 6. Eliminar insumos y consumibles de prueba (sin impactar catálogo real)
DELETE FROM consumibles
WHERE id IN ('Prueba', 'Pape5016')
   OR material ILIKE '%prueba%'
   OR material ILIKE '%test%';

DELETE FROM papeleria
WHERE id = 'Pape5016'
   OR material ILIKE '%prueba%';

-- 7. Eliminar proyectos STEAM de prueba
DELETE FROM proyectos_steam
WHERE nombre ILIKE '%proyecto prueba%'
   OR nombre ILIKE '%betatesting%';

-- 8. Limpiar entradas de auditoría generadas por los registros ficticios
DELETE FROM historial_movimientos
WHERE placa_o_id IN ('P57', 'TEST-CHECK', 'Prueba', 'Pape5016', 'MOB-0001', 'MOB-0002')
   OR elemento_nombre ILIKE '%prueba equipo%'
   OR elemento_nombre ILIKE '%test activo%'
   OR elemento_nombre ILIKE '%Proyecto: Proyecto prueba%'
   OR detalles ILIKE '%betatesting1 - Prueba de flujo%'
   OR detalles ILIKE '%Solicitud autorizada: Prueba 1%';

-- Asegurar estado 'Disponible' y custodio nulo para activos liberados
UPDATE activos
SET estado = 'Disponible', custodio = NULL, custodio_documento = NULL, usuario_id = NULL
WHERE placa IN ('ACT-FMO-001', 'ACT-FMO-006')
  AND estado = 'Devuelto';

COMMIT;
