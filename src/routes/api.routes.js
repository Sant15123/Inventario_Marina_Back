import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// ==========================================
// 1. ACTIVOS
// ==========================================

// GET /api/activos - Lista todos los activos
router.get('/activos', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM activos ORDER BY placa ASC');
    res.json({ success: true, data: result.rows || [] });
  } catch (error) {
    console.error('Error al obtener activos de DB:', error.message);
    res.status(500).json({ success: false, data: [], error: error.message });
  }
});

// GET /api/activos/:placa - Detalle de un activo por placa
router.get('/activos/:placa', async (req, res, next) => {
  try {
    const { placa } = req.params;
    const result = await pool.query(
      'SELECT * FROM activos WHERE LOWER(placa) = LOWER($1)',
      [placa.trim()]
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ success: false, message: `Activo con placa ${placa} no encontrado` });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error al obtener activo por placa:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/activos - Crear un nuevo activo
router.post('/activos', async (req, res, next) => {
  try {
    const {
      placa,
      nombre,
      marca,
      modelo,
      serial,
      sede = 'Medellín',
      estado = 'Disponible',
      custodio = null,
      fecha_devolucion = null
    } = req.body;

    if (!placa || !nombre) {
      return res.status(400).json({ success: false, message: 'La placa y el nombre son obligatorios.' });
    }

    const result = await pool.query(
      `INSERT INTO activos (placa, nombre, marca, modelo, serial, sede, estado, custodio, fecha_devolucion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        placa.trim(),
        nombre.trim(),
        marca || null,
        modelo || null,
        serial ? serial.trim() : null,
        sede,
        estado,
        custodio,
        fecha_devolucion
      ]
    );

    res.status(201).json({ success: true, message: 'Activo creado exitosamente', data: result.rows[0] });
  } catch (error) {
    console.error('Error al crear activo:', error.message);
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Ya existe un activo con esa placa o serial' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 2. CONSUMIBLES
// ==========================================

// GET /api/consumibles - Lista de consumibles / materiales
router.get('/consumibles', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM consumibles ORDER BY material ASC');
    res.json({ success: true, data: result.rows || [] });
  } catch (error) {
    console.error('Error al obtener consumibles de DB:', error.message);
    res.status(500).json({ success: false, data: [], error: error.message });
  }
});

// ==========================================
// 3. PRÉSTAMOS
// ==========================================

// GET /api/prestamos - Lista historial de préstamos
router.get('/prestamos', async (req, res, next) => {
  try {
    const query = `
      SELECT p.*, a.nombre as nombre_activo, a.marca, a.modelo
      FROM prestamos p
      LEFT JOIN activos a ON LOWER(p.placa_activo) = LOWER(a.placa)
      ORDER BY p.id DESC
    `;
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows || [] });
  } catch (error) {
    console.error('Error al obtener préstamos de DB:', error.message);
    res.status(500).json({ success: false, data: [], error: error.message });
  }
});

// POST /api/prestamos - Registra préstamo y actualiza activo (transacción)
router.post('/prestamos', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      placa_activo,
      solicitante,
      sede = 'Medellín',
      motivo = '',
      fecha_salida,
      fecha_devolucion_esperada
    } = req.body;

    if (!placa_activo || !solicitante || !fecha_devolucion_esperada) {
      return res.status(400).json({
        success: false,
        message: 'placa_activo, solicitante y fecha_devolucion_esperada son requeridos.'
      });
    }

    await client.query('BEGIN');

    const activoRes = await client.query(
      'SELECT * FROM activos WHERE LOWER(placa) = LOWER($1) FOR UPDATE',
      [placa_activo.trim()]
    );

    if (activoRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: `Activo con placa ${placa_activo} no encontrado.` });
    }

    const activoActual = activoRes.rows[0];

    const prestamoRes = await client.query(
      `INSERT INTO prestamos (placa_activo, solicitante, sede, motivo, fecha_salida, fecha_devolucion_esperada, estado)
       VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6, 'Activo')
       RETURNING *`,
      [
        activoActual.placa,
        solicitante.trim(),
        sede,
        motivo,
        fecha_salida || null,
        fecha_devolucion_esperada
      ]
    );

    await client.query(
      `UPDATE activos
       SET estado = 'En campo',
           custodio = $1,
           fecha_devolucion = $2
       WHERE placa = $3`,
      [solicitante.trim(), fecha_devolucion_esperada, activoActual.placa]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Préstamo registrado exitosamente y activo actualizado',
      data: prestamoRes.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al crear préstamo:', error.message);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// PUT /api/prestamos/:id/devolver - Marca préstamo como devuelto y restaura activo
router.put('/prestamos/:id/devolver', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const prestamoRes = await client.query(
      'SELECT * FROM prestamos WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (prestamoRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Préstamo no encontrado' });
    }

    const prestamo = prestamoRes.rows[0];

    const updatedPrestamoRes = await client.query(
      `UPDATE prestamos
       SET estado = 'Devuelto',
           fecha_devolucion_real = CURRENT_DATE
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    await client.query(
      `UPDATE activos
       SET estado = 'Disponible',
           custodio = NULL,
           fecha_devolucion = NULL
       WHERE LOWER(placa) = LOWER($1)`,
      [prestamo.placa_activo]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Préstamo marcado como devuelto y activo disponible nuevamente',
      data: updatedPrestamoRes.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al devolver préstamo:', error.message);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

export default router;
