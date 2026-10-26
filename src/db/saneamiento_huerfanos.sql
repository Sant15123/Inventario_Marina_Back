-- ======================================================================================
-- SCRIPT DE SANEAMIENTO Y REGULARIZACIÓN DE DATOS (SIGA - FUNDACIÓN MARINA ORTH)
-- Script Opcional para Ejecución en Supabase SQL Editor / PostgreSQL
-- ======================================================================================
-- Este script realiza:
-- 1. Creación de un usuario comodín para preservar la integridad de datos históricos.
-- 2. Vinculación automática de préstamos y entregas huérfanas con perfiles existentes por documento/nombre.
-- 3. Reasignación de registros sin correspondencia humana al usuario comodín del sistema.
-- 4. Creación opcional de Foreign Keys con ON UPDATE CASCADE para prevenir desalineaciones futuras.
-- ======================================================================================

BEGIN;

-- --------------------------------------------------------------------------------------
-- 1. CREACIÓN DEL PERFIL COMODÍN / HISTÓRICO
-- --------------------------------------------------------------------------------------
INSERT INTO perfiles (
  id,
  documento,
  nombre_completo,
  email,
  rol,
  activo,
  sede,
  cargo,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '9999999999',
  'Usuario Histórico / No Identificado',
  'historico@fmo.org',
  'usuario',
  false,
  'Medellín',
  'Custodio Histórico Legacy',
  NOW(),
  NOW()
)
ON CONFLICT (documento) DO UPDATE 
SET nombre_completo = EXCLUDED.nombre_completo;


-- --------------------------------------------------------------------------------------
-- 2. VINCULACIÓN DE PRÉSTAMOS CON PERFILES EXISTENTES
-- --------------------------------------------------------------------------------------
-- 2.1 Vincular cuando coincide el documento del solicitante:
UPDATE prestamos p
SET 
  usuario_id = u.id,
  custodio_documento = u.documento,
  solicitante_documento = u.documento
FROM perfiles u
WHERE (p.usuario_id IS NULL OR p.custodio_documento IS NULL)
  AND (
    (p.solicitante_documento IS NOT NULL AND LOWER(p.solicitante_documento) = LOWER(u.documento))
    OR (p.custodio_documento IS NOT NULL AND LOWER(p.custodio_documento) = LOWER(u.documento))
  );

-- 2.2 Vincular por coincidencia exacta de nombre completo:
UPDATE prestamos p
SET 
  usuario_id = u.id,
  custodio_documento = u.documento,
  solicitante_documento = u.documento
FROM perfiles u
WHERE p.usuario_id IS NULL
  AND p.solicitante IS NOT NULL
  AND LOWER(TRIM(p.solicitante)) = LOWER(TRIM(u.nombre_completo));

-- 2.3 Regularización de casos conocidos de nombres con variaciones (acentos o apellidos extra):
UPDATE prestamos p
SET 
  usuario_id = u.id,
  custodio_documento = u.documento,
  solicitante_documento = u.documento
FROM perfiles u
WHERE p.usuario_id IS NULL
  AND (
    (LOWER(TRIM(p.solicitante)) LIKE 'sof%a mu%oz%' AND LOWER(u.nombre_completo) LIKE 'sof%a mu%oz%')
    OR (LOWER(TRIM(p.solicitante)) LIKE 'santiago suarez%' AND LOWER(u.nombre_completo) LIKE 'santiago su%rez%')
  );

-- 2.4 Reasignar los préstamos restantes sin perfil registrado al usuario comodín:
UPDATE prestamos
SET 
  usuario_id = '00000000-0000-0000-0000-000000000001',
  custodio_documento = '9999999999',
  solicitante_documento = COALESCE(solicitante_documento, '9999999999')
WHERE usuario_id IS NULL;


-- --------------------------------------------------------------------------------------
-- 3. VINCULACIÓN DE ENTREGAS DE CONSUMIBLES CON PERFILES
-- --------------------------------------------------------------------------------------
-- 3.1 Vincular por coincidencia de documento o nombre:
UPDATE entregas_consumibles e
SET 
  usuario_id = u.id,
  responsable_documento = u.documento,
  custodio_documento = u.documento
FROM perfiles u
WHERE (e.usuario_id IS NULL OR e.responsable_documento IS NULL)
  AND (
    (e.responsable_documento IS NOT NULL AND LOWER(e.responsable_documento) = LOWER(u.documento))
    OR (e.responsable IS NOT NULL AND LOWER(TRIM(e.responsable)) = LOWER(TRIM(u.nombre_completo)))
  );

-- 3.2 Reasignar entregas restantes sin perfil al usuario comodín:
UPDATE entregas_consumibles
SET 
  usuario_id = '00000000-0000-0000-0000-000000000001',
  responsable_documento = COALESCE(responsable_documento, '9999999999'),
  custodio_documento = COALESCE(custodio_documento, '9999999999')
WHERE usuario_id IS NULL;


-- --------------------------------------------------------------------------------------
-- 4. LIMPIEZA DE ÍTEMS DE SOLICITUDES HUÉRFANAS (SI EXISTIERAN)
-- --------------------------------------------------------------------------------------
DELETE FROM items_solicitud
WHERE solicitud_id NOT IN (SELECT id FROM solicitudes_inventario);


-- --------------------------------------------------------------------------------------
-- 5. BLINDAJE DE INTEGRIDAD: CREACIÓN DE CLAVES FORÁNEAS (OPCIONAL RECOMENDADO)
-- --------------------------------------------------------------------------------------
-- Permite que los cambios de placa o id cascaden automáticamente y que al eliminar
-- un usuario o proyecto no se generen errores ni registros rotos.

DO $$
BEGIN
  -- Foreign Key de prestamos a perfiles
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'prestamos_usuario_id_fkey'
  ) THEN
    ALTER TABLE prestamos
      ADD CONSTRAINT prestamos_usuario_id_fkey
      FOREIGN KEY (usuario_id) REFERENCES perfiles(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;

  -- Foreign Key de entregas_consumibles a perfiles
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'entregas_consumibles_usuario_id_fkey'
  ) THEN
    ALTER TABLE entregas_consumibles
      ADD CONSTRAINT entregas_consumibles_usuario_id_fkey
      FOREIGN KEY (usuario_id) REFERENCES perfiles(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;

-- Consulta de verificación posterior al saneamiento:
SELECT 
  'Préstamos aún sin usuario_id' AS metrica,
  COUNT(*) AS total
FROM prestamos
WHERE usuario_id IS NULL
UNION ALL
SELECT 
  'Entregas aún sin usuario_id' AS metrica,
  COUNT(*) AS total
FROM entregas_consumibles
WHERE usuario_id IS NULL;
