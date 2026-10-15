import XLSX from 'xlsx';
import { pool } from '../../db.js';

// Función para parsear cantidades asegurando un entero válido
function parseCantidad(val) {
  if (val === undefined || val === null) return 1;
  if (typeof val === 'number') return Math.max(0, Math.floor(val));

  const str = String(val).trim();
  if (!str) return 1;

  // Extraer número al inicio si existe (ej. "4 Bolsas" -> 4)
  const match = str.match(/^(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }

  // Textos como "Bolsa", "Caja", "Caja Rimax", "Muiltiples" se normalizan a 1
  return 1;
}

function cleanString(val, defaultVal = null) {
  if (val === undefined || val === null) return defaultVal;
  const s = String(val).trim();
  if (!s || s === 'No data' || s === 'N/A' || s === 'NA' || s === 'undefined') return defaultVal;
  return s;
}

export async function seedConsumibles() {
  const filePath = 'C:/Users/PC/Downloads/Inventario 2026 (1).xlsx';
  console.log(`Leyendo hoja "Materiales y consumibles Rob" desde: ${filePath}...`);

  const wb = XLSX.readFile(filePath);
  const sheetName = 'Materiales y consumibles Rob';
  const ws = wb.Sheets[sheetName];

  if (!ws) {
    throw new Error(`La hoja "${sheetName}" no existe en el archivo Excel.`);
  }

  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  console.log(`Total filas en la hoja: ${rawRows.length}`);

  // Asegurar que la tabla consumibles tenga la columna area
  await pool.query('ALTER TABLE consumibles ADD COLUMN IF NOT EXISTS area VARCHAR(100) DEFAULT \'Robótica\';');

  let insertedCount = 0;
  let updatedCount = 0;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Fila 0 es vacía, Fila 1 son cabeceras, Fila 2 a 143 son los 142 ítems (Rob0001 a Rob0142)
    for (let i = 2; i <= 143; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0) continue;

      const rawId = row[0];
      const rawMaterial = row[1];

      if (!rawId || !rawMaterial || String(rawMaterial).trim() === '') continue;

      const id = String(rawId).trim();
      const material = String(rawMaterial).trim();
      const disponible = parseCantidad(row[2]);
      const minimo = 5;

      const rawDesc = cleanString(row[3]);
      const rawCaract = cleanString(row[4]);
      const area = cleanString(row[5], 'Robótica');
      const ubicacion = cleanString(row[7], 'Oficina FMO');
      const estado = cleanString(row[12], 'Bueno');
      const condicion = cleanString(row[13], 'Usados');
      const rawObs = cleanString(row[14]);

      // Concatenar descripción completa
      const descParts = [rawDesc, rawCaract ? `Características: ${rawCaract}` : null, rawObs ? `Obs: ${rawObs}` : null].filter(Boolean);
      const descripcion = descParts.length > 0 ? descParts.join(' | ') : rawDesc;

      const categoria = 'Robótica';
      const caracteristicas = rawCaract || null;
      const observaciones = rawObs || null;

      const upsertQuery = `
        INSERT INTO consumibles (
          id, material, categoria, disponible, minimo, ubicacion,
          condicion, estado, area, descripcion, caracteristicas, observaciones
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12
        )
        ON CONFLICT (id) DO UPDATE SET
          material = EXCLUDED.material,
          categoria = EXCLUDED.categoria,
          disponible = EXCLUDED.disponible,
          minimo = EXCLUDED.minimo,
          ubicacion = EXCLUDED.ubicacion,
          condicion = EXCLUDED.condicion,
          estado = EXCLUDED.estado,
          area = EXCLUDED.area,
          descripcion = EXCLUDED.descripcion,
          caracteristicas = EXCLUDED.caracteristicas,
          observaciones = EXCLUDED.observaciones
        RETURNING (xmax = 0) AS is_insert;
      `;

      const values = [
        id,
        material,
        categoria,
        disponible,
        minimo,
        ubicacion,
        condicion,
        estado,
        area,
        descripcion,
        caracteristicas,
        observaciones
      ];

      const res = await client.query(upsertQuery, values);
      if (res.rows[0].is_insert) {
        insertedCount++;
      } else {
        updatedCount++;
      }
    }

    await client.query('COMMIT');

    console.log(`✅ Siembra de consumibles finalizada exitosamente.`);
    console.log(`- Nuevos materiales insertados: ${insertedCount}`);
    console.log(`- Materiales existentes actualizados: ${updatedCount}`);
    console.log(`- Total materiales procesados: ${insertedCount + updatedCount}`);

    const totalInDb = await client.query('SELECT COUNT(*) FROM consumibles');
    console.log(`- Total registros en tabla consumibles: ${totalInDb.rows[0].count}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en la siembra de consumibles:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Ejecución directa
if (process.argv[1] && process.argv[1].endsWith('seed_consumibles.js')) {
  seedConsumibles()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error(e);
      await pool.end();
      process.exit(1);
    });
}
