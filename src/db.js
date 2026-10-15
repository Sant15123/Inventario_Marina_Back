import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import dns from 'dns';
import { fileURLToPath } from 'url';

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

      CREATE TABLE IF NOT EXISTS entregas_consumibles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        material_id VARCHAR(50),
        material_nombre VARCHAR(150),
        cantidad INTEGER NOT NULL,
        responsable VARCHAR(150) NOT NULL,
        sede VARCHAR(150),
        proyecto_motivo TEXT,
        tipo VARCHAR(50) DEFAULT 'Consumido',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
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

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al inicializar tablas:', err);
  } finally {
    client.release();
  }
};
