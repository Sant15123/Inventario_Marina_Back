import XLSX from 'xlsx';
import { pool } from '../../db.js';

export async function seedPapeleria() {
  const filePath = 'C:/Users/PC/Downloads/20260304 Inventario de Papelería.xlsx';
  console.log(`Leyendo archivo de papelería desde: ${filePath}...`);

  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  if (!ws) {
    throw new Error(`La hoja "${sheetName}" no existe en el archivo.`);
  }

  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  console.log(`Filas leídas del Excel de Papelería: ${rawRows.length}`);

  const client = await pool.connect();
  let currentCaja = 'Fuera de cajas';
  let insertCount = 0;
  let updateCount = 0;

  try {
    await client.query('BEGIN');

    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0) continue;

      const firstCell = String(row[0] || '').trim();

      // Detección de encabezado de caja o sección
      if (firstCell.toUpperCase().startsWith('CAJA') || firstCell.toUpperCase().includes('FUERA')) {
        currentCaja = firstCell;
        continue;
      }

      // Si es un ítem de papelería
      if (firstCell.toLowerCase().startsWith('pape')) {
        const id = firstCell;
        const material = String(row[1] || '').trim();
        if (!material || material === 'undefined') continue;

        let cant = 0;
        const rawCant = row[2];
        if (typeof rawCant === 'number') {
          cant = Math.max(0, Math.round(rawCant));
        } else if (typeof rawCant === 'string') {
          const num = parseInt(rawCant.replace(/[^0-9]/g, ''), 10);
          cant = !isNaN(num) ? num : (rawCant.toLowerCase().includes('vari') ? 10 : 1);
        }

        const descripcion = row[3] ? String(row[3]).trim() : null;
        const responsable = row[4] ? String(row[4]).trim() : null;
        const sede = row[5] ? String(row[5]).trim() : 'Oficina FMO';
        const estado = row[6] ? String(row[6]).trim() : 'Bueno';
        const condicion = row[7] ? String(row[7]).trim() : 'Nuevos';
        const observaciones = row[8] ? String(row[8]).trim() : null;

        const checkRes = await client.query('SELECT id FROM papeleria WHERE LOWER(id) = LOWER($1)', [id]);

        if (checkRes.rows.length === 0) {
          await client.query(`
            INSERT INTO papeleria (
              id, material, descripcion, disponible, minimo, sede,
              ubicacion_estante, condicion, estado, observaciones, responsable
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `, [
            id,
            material,
            descripcion,
            cant,
            5,
            sede,
            currentCaja,
            condicion,
            estado,
            observaciones,
            responsable
          ]);
          insertCount++;
        } else {
          await client.query(`
            UPDATE papeleria SET
              material = $2,
              descripcion = COALESCE($3, descripcion),
              disponible = $4,
              sede = COALESCE($5, sede),
              ubicacion_estante = COALESCE($6, ubicacion_estante),
              condicion = COALESCE($7, condicion),
              estado = COALESCE($8, estado),
              observaciones = COALESCE($9, observaciones),
              responsable = COALESCE($10, responsable),
              updated_at = NOW()
            WHERE LOWER(id) = LOWER($1)
          `, [
            id,
            material,
            descripcion,
            cant,
            sede,
            currentCaja,
            condicion,
            estado,
            observaciones,
            responsable
          ]);
          updateCount++;
        }
      }
    }

    await client.query('COMMIT');
    console.log(`✅ Carga de papelería completada: ${insertCount} insertados, ${updateCount} actualizados.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error al sembrar papelería:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Ejecutar si se invoca directamente por CLI
if (process.argv[1] && process.argv[1].endsWith('seed_papeleria.js')) {
  seedPapeleria()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
