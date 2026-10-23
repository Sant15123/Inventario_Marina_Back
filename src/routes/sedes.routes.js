import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

// GET /api/sedes
router.get('/', async (req, res) => {
  try {
    const { activo, search } = req.query;
    let query = 'SELECT * FROM sedes WHERE 1=1';
    const params = [];

    if (activo !== undefined && activo !== 'todos') {
      const isActivo = activo === 'true' || activo === true;
      params.push(isActivo);
      query += ' AND activo = $' + params.length;
    } else if (activo === undefined) {
      params.push(true);
      query += ' AND activo = $' + params.length;
    }

    if (search) {
      params.push('%' + search.trim().toLowerCase() + '%');
      const pIdx = params.length;
      query += ' AND (LOWER(nombre) LIKE $' + pIdx + ' OR LOWER(COALESCE(municipio, \'\')) LIKE $' + pIdx + ' OR LOWER(COALESCE(direccion, \'\')) LIKE $' + pIdx + ')';
    }

    query += ' ORDER BY nombre ASC';

    const result = await pool.query(query, params);
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows || []
    });
  } catch (error) {
    console.error('Error al listar sedes:', error.message);
    res.status(500).json({ success: false, data: [], error: error.message });
  }
});

// POST /api/sedes
router.post('/', async (req, res) => {
  try {
    const { nombre, municipio, direccion, activo = true } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({
        success: false,
        message: 'El nombre de la sede es obligatorio.'
      });
    }

    const query = 'INSERT INTO sedes (nombre, municipio, direccion, activo) VALUES ($1, $2, $3, $4) ON CONFLICT (nombre) DO UPDATE SET activo = true, municipio = COALESCE(EXCLUDED.municipio, sedes.municipio), direccion = COALESCE(EXCLUDED.direccion, sedes.direccion) RETURNING *;';
    const values = [nombre.trim(), municipio ? municipio.trim() : null, direccion ? direccion.trim() : null, activo];

    const result = await pool.query(query, values);
    const nuevaSede = result.rows[0];

    res.status(201).json({
      success: true,
      message: 'Sede registrada exitosamente.',
      data: nuevaSede
    });
  } catch (error) {
    console.error('Error al crear sede:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
