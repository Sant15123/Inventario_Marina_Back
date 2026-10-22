-- ====================================================================
-- Migración 05: Proyectos STEAM y Relaciones Estrictas de Custodios
-- Fundación Marina Orth - Sistema SIGA
-- ====================================================================

-- 1. Tabla de Proyectos STEAM
CREATE TABLE IF NOT EXISTS proyectos_steam (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(150) NOT NULL,
  sede_municipio VARCHAR(100),
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proyectos_activo ON proyectos_steam(activo);
CREATE INDEX IF NOT EXISTS idx_proyectos_sede ON proyectos_steam(sede_municipio);
CREATE INDEX IF NOT EXISTS idx_proyectos_nombre ON proyectos_steam(nombre);

-- 2. Asegurar columnas y relaciones en prestamos
ALTER TABLE prestamos ADD COLUMN IF NOT EXISTS usuario_id UUID;
ALTER TABLE prestamos ADD COLUMN IF NOT EXISTS custodio_documento VARCHAR(50);
ALTER TABLE prestamos ADD COLUMN IF NOT EXISTS solicitante_documento VARCHAR(50);

-- Sincronizar custodio_documento con solicitante_documento si uno de ellos está poblado
UPDATE prestamos 
SET custodio_documento = solicitante_documento 
WHERE custodio_documento IS NULL AND solicitante_documento IS NOT NULL;

UPDATE prestamos 
SET solicitante_documento = custodio_documento 
WHERE solicitante_documento IS NULL AND custodio_documento IS NOT NULL;

-- Relación de Foreign Key con perfiles (id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'prestamos_usuario_id_fkey' AND table_name = 'prestamos'
  ) THEN
    ALTER TABLE prestamos 
    ADD CONSTRAINT prestamos_usuario_id_fkey 
    FOREIGN KEY (usuario_id) REFERENCES perfiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Asegurar columnas y relaciones en remisiones_consumibles
ALTER TABLE remisiones_consumibles ADD COLUMN IF NOT EXISTS usuario_id UUID;
ALTER TABLE remisiones_consumibles ADD COLUMN IF NOT EXISTS custodio_documento VARCHAR(50);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'remisiones_usuario_id_fkey' AND table_name = 'remisiones_consumibles'
  ) THEN
    ALTER TABLE remisiones_consumibles 
    ADD CONSTRAINT remisiones_usuario_id_fkey 
    FOREIGN KEY (usuario_id) REFERENCES perfiles(id) ON DELETE SET NULL;
  END IF;
END $$;
