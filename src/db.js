import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import dns from 'dns';
import { fileURLToPath } from 'url';
import { sincronizarHistorialInicial } from './services/historial.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignorar si no se puede cambiar DNS
}

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config();

const { Pool } = pkg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ Error crítico: DATABASE_URL no está definida en las variables de entorno.');
}

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

export const initDb = async () => {
  let client;
  try {
    client = await pool.connect();
    console.log('✅ Conexión con Supabase (PostgreSQL) establecida.');
  } catch (err) {
    console.error('❌ Error conectando a la base de datos Supabase:', err.message);
    throw err;
  }

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS activos (
        id SERIAL PRIMARY KEY,
        placa VARCHAR(100) UNIQUE NOT NULL,
        nombre VARCHAR(255) NOT NULL,
        marca VARCHAR(100),
        modelo VARCHAR(100),
        serial VARCHAR(100) UNIQUE,
        sede VARCHAR(100) DEFAULT 'Medellín',
        estado VARCHAR(50) DEFAULT 'Disponible',
        custodio VARCHAR(255),
        fecha_devolucion DATE,
        categoria VARCHAR(100),
        condicion VARCHAR(100),
        area VARCHAR(100),
        ubicacion VARCHAR(255),
        cantidad INT DEFAULT 1,
        descripcion TEXT,
        caracteristica_1 VARCHAR(255),
        caracteristica_2 VARCHAR(255),
        caracteristica_3 VARCHAR(255),
        responsable VARCHAR(255),
        proveedor VARCHAR(255),
        valor_compra NUMERIC,
        valor_total NUMERIC,
        fecha_compra DATE,
        fecha_vencimiento_garantia DATE,
        claves_otros TEXT,
        observaciones TEXT,
        ubicacion_estante VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS consumibles (
        id VARCHAR(100) PRIMARY KEY,
        material VARCHAR(255) NOT NULL,
        categoria VARCHAR(100),
        disponible INT DEFAULT 0,
        minimo INT DEFAULT 0,
        ubicacion VARCHAR(100),
        ubicacion_estante VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS prestamos (
        id SERIAL PRIMARY KEY,
        placa_activo VARCHAR(100),
        tipo_item VARCHAR(50) DEFAULT 'activo',
        cantidad INT DEFAULT 1,
        solicitante VARCHAR(255) NOT NULL,
        sede VARCHAR(100) NOT NULL,
        motivo VARCHAR(255),
        fecha_salida DATE DEFAULT CURRENT_DATE,
        fecha_devolucion_esperada DATE NOT NULL,
        fecha_devolucion_real DATE,
        estado VARCHAR(50) DEFAULT 'Activo'
      );

      ALTER TABLE prestamos DROP CONSTRAINT IF EXISTS prestamos_placa_activo_fkey;
      ALTER TABLE prestamos ADD COLUMN IF NOT EXISTS tipo_item VARCHAR(50) DEFAULT 'activo';
      ALTER TABLE prestamos ADD COLUMN IF NOT EXISTS cantidad INT DEFAULT 1;
      ALTER TABLE prestamos ADD COLUMN IF NOT EXISTS solicitante_documento VARCHAR(50);
      ALTER TABLE prestamos ADD COLUMN IF NOT EXISTS usuario_id UUID;

      CREATE TABLE IF NOT EXISTS entregas_consumibles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        material_id VARCHAR(50),
        material_nombre VARCHAR(150),
        cantidad INTEGER NOT NULL,
        responsable VARCHAR(150) NOT NULL,
        sede VARCHAR(150),
        proyecto_motivo TEXT,
        tipo VARCHAR(50) DEFAULT 'Consumido',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        responsable_documento VARCHAR(50),
        usuario_id UUID
      );

      CREATE TABLE IF NOT EXISTS perfiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        documento VARCHAR(20) UNIQUE NOT NULL,
        nombre_completo VARCHAR(150) NOT NULL,
        telefono VARCHAR(25),
        email VARCHAR(100) UNIQUE NOT NULL,
        rol VARCHAR(30) NOT NULL DEFAULT 'usuario' CHECK (rol IN ('administrador', 'operador', 'supervisor', 'usuario')),
        activo BOOLEAN DEFAULT true,
        sede VARCHAR(100) DEFAULT 'Medellín',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS papeleria (
        id VARCHAR(50) PRIMARY KEY,
        material VARCHAR(200) NOT NULL,
        descripcion TEXT,
        disponible INTEGER NOT NULL DEFAULT 0,
        minimo INTEGER DEFAULT 5,
        sede VARCHAR(100) DEFAULT 'Oficina FMO',
        ubicacion_estante VARCHAR(100),
        condicion VARCHAR(50) DEFAULT 'Nuevos',
        estado VARCHAR(50) DEFAULT 'Bueno',
        observaciones TEXT,
        responsable VARCHAR(150),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS historial_movimientos (
        id SERIAL PRIMARY KEY,
        tipo VARCHAR(50) NOT NULL,
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

      CREATE INDEX IF NOT EXISTS idx_historial_fecha ON historial_movimientos(fecha DESC);
      CREATE INDEX IF NOT EXISTS idx_historial_placa ON historial_movimientos(placa_o_id);
      CREATE INDEX IF NOT EXISTS idx_historial_tipo ON historial_movimientos(tipo);

      
      CREATE TABLE IF NOT EXISTS sedes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nombre VARCHAR(150) NOT NULL UNIQUE,
        municipio VARCHAR(100),
        direccion TEXT,
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_sedes_nombre ON sedes(nombre);
      CREATE INDEX IF NOT EXISTS idx_sedes_municipio ON sedes(municipio);

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

      ALTER TABLE historial_movimientos ADD COLUMN IF NOT EXISTS usuario_id UUID;
      ALTER TABLE activos ADD COLUMN IF NOT EXISTS tipo_inventario VARCHAR(50) DEFAULT 'tecnologia';
      ALTER TABLE activos ADD COLUMN IF NOT EXISTS custodio_documento VARCHAR(50);
      ALTER TABLE activos ADD COLUMN IF NOT EXISTS usuario_id UUID;
      ALTER TABLE consumibles ADD COLUMN IF NOT EXISTS tipo_inventario VARCHAR(50) DEFAULT 'robotica';

      ALTER TABLE prestamos ADD COLUMN IF NOT EXISTS usuario_id UUID;
      ALTER TABLE prestamos ADD COLUMN IF NOT EXISTS custodio_documento VARCHAR(50);
      ALTER TABLE prestamos ADD COLUMN IF NOT EXISTS solicitante_documento VARCHAR(50);

      ALTER TABLE remisiones_consumibles ADD COLUMN IF NOT EXISTS usuario_id UUID;
      ALTER TABLE remisiones_consumibles ADD COLUMN IF NOT EXISTS custodio_documento VARCHAR(50);
      ALTER TABLE items_solicitud ALTER COLUMN item_id TYPE VARCHAR(255);

      ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS cargo VARCHAR(150);
      ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS password VARCHAR(255);
      ALTER TABLE historial_movimientos ADD COLUMN IF NOT EXISTS documento_responsable VARCHAR(50);
    `);

    // Sincronizar custodio_documento y solicitante_documento en prestamos
    await client.query(`
      UPDATE prestamos 
      SET custodio_documento = solicitante_documento 
      WHERE custodio_documento IS NULL AND solicitante_documento IS NOT NULL;
      
      UPDATE prestamos 
      SET solicitante_documento = custodio_documento 
      WHERE solicitante_documento IS NULL AND custodio_documento IS NOT NULL;
    `);

    // Semillas si están vacías
    const countActivos = await client.query('SELECT COUNT(*) FROM activos');
    if (parseInt(countActivos.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO activos (placa, nombre, marca, modelo, serial, sede, estado)
        VALUES 
          ('FMO-EQ-001', 'Portátil HP ProBook 450 G8', 'HP', 'ProBook 450 G8', '5CD1234ABC', 'Medellín', 'Disponible'),
          ('FMO-EQ-002', 'Portátil HP ProBook 450 G8', 'HP', 'ProBook 450 G8', '5CD1234ABD', 'Medellín', 'Disponible'),
          ('FMO-EQ-003', 'Kit Robótica LEGO SPIKE Prime', 'LEGO Education', 'SPIKE Prime', 'LEG-883921', 'El Carmen', 'Disponible'),
          ('FMO-EQ-004', 'Tablet Samsung Galaxy Tab A8', 'Samsung', 'Galaxy Tab A8', 'R52N10ABC', 'Medellín', 'Disponible')
        ON CONFLICT (placa) DO NOTHING;
      `);
    }

    const countConsumibles = await client.query('SELECT COUNT(*) FROM consumibles');
    if (parseInt(countConsumibles.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO consumibles (id, material, categoria, disponible, minimo, ubicacion)
        VALUES 
          ('MAT-001', 'Filamento PLA 1.75mm Gris', 'Impresión 3D', 4, 2, 'Almacén Medellín - Estante 2'),
          ('MAT-002', 'Filamento PLA 1.75mm Azul', 'Impresión 3D', 1, 2, 'Almacén Medellín - Estante 2'),
          ('MAT-003', 'Baterías Recargables AA (pack 4)', 'Electrónica', 8, 3, 'Bodega Medellín'),
          ('MAT-004', 'Cables USB-C a USB-A 1.5m', 'Cables y Adaptadores', 15, 5, 'Bodega Medellín')
        ON CONFLICT (id) DO NOTHING;
      `);
    }

    const countPerfiles = await client.query('SELECT COUNT(*) FROM perfiles');
    if (parseInt(countPerfiles.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO perfiles (documento, nombre_completo, telefono, email, rol, sede, cargo)
        VALUES 
          ('100123456', 'Santiago Ortiz', '3001234567', 'santiago.ortiz@fmo.org', 'administrador', 'Medellín', 'Coordinador Tecnológico & STEAM'),
          ('1002345678', 'Nicolas Tamayo', '3104567890', 'nicolas.tamayo@fmo.org', 'supervisor', 'Carmen de Viboral', 'Supervisor de Sedes & Semilleros'),
          ('1003456789', 'Dolly Montoya', '3157891234', 'dolly.montoya@fmo.org', 'operador', 'Carmen de Viboral', 'Operadora de Inventario & Bodega'),
          ('1040321654', 'Yury Torres', '3203216549', 'yury.torres@fmo.org', 'usuario', 'Medellín', 'Formadora Robótica STEAM'),
          ('1064123987', 'Santiago Galeano', '3005551234', 'santiago.galeano@fmo.org', 'administrador', 'Medellín', 'Formador de Semilleros STEAM'),
          ('1052987654', 'Sofia Muñoz', '3129876543', 'sofia.munoz@fmo.org', 'usuario', 'Medellín', 'Formadora STEAM & Electrónica')
        ON CONFLICT (documento) DO NOTHING;
      `);
    }

    
    const countSedes = await client.query('SELECT COUNT(*) FROM sedes');
    if (parseInt(countSedes.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO sedes (nombre, municipio, direccion, activo)
        VALUES 
          ('Medellín', 'Medellín', 'Sede Principal FMO', true),
          ('Carmen de Viboral', 'Carmen de Viboral', 'Casa de la Cultura / Sede Robótica', true),
          ('La Ceja', 'La Ceja', 'Institución Educativa Aliada', true),
          ('El Retiro', 'El Retiro', 'Sede Rural STEAM', true),
          ('Nacional', 'Colombia', 'Cobertura Nacional', true)
        ON CONFLICT (nombre) DO NOTHING;
      `);
    }
  
    const countProyectos = await client.query('SELECT COUNT(*) FROM proyectos_steam');
    if (parseInt(countProyectos.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO proyectos_steam (nombre, sede_municipio, descripcion, activo)
        VALUES 
          ('Semilleros de Robótica Educativa', 'Medellín', 'Formación STEAM en programación y robótica para estudiantes', true),
          ('Aulas Conectadas STEAM', 'El Carmen', 'Dotación tecnológica e innovación educativa en sedes rurales', true),
          ('Clubes de Innovación y Electrónica', 'La Ceja', 'Talleres prácticos de impresión 3D, sensores y electrónica básica', true);
      `);
    }

    await client.query(`
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
      `);

    await client.query('COMMIT');
    await sincronizarHistorialInicial(client);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al inicializar tablas:', err);
  } finally {
    client.release();
  }
};
