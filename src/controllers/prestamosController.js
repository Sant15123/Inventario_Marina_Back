// controllers/prestamosController.js
import { supabase } from '../config/supabaseClient.js';
import { pool } from '../db.js';
import { registrarMovimiento } from '../services/historial.service.js';

export const actualizarPrestamo = async (req, res) => {
  try {
    const { id } = req.params;
    const { fecha_devolucion_esperada, observaciones, sede } = req.body;

    // 1. Validar que la fecha venga presente y no sea anterior a hoy
    const fechaEsperada = fecha_devolucion_esperada || req.body.fecha_devolucion_pactada || req.body.fecha_devolucion || req.body.expectedReturn;

    if (fechaEsperada) {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      const [year, month, day] = String(fechaEsperada).split('T')[0].split('-').map(Number);
      const fechaPactada = new Date(year, month - 1, day);

      if (fechaPactada < hoy) {
        return res.status(400).json({
          error: 'La fecha de devolución pactada no puede ser anterior a la fecha actual.'
        });
      }
    }

    // 2. Construir objeto de actualización con los nombres exactos de Supabase
    const updateData = {
      ...(fechaEsperada && { fecha_devolucion_esperada: String(fechaEsperada).split('T')[0] }),
      ...(observaciones !== undefined && { observaciones, motivo: observaciones }),
      ...(sede && { sede: String(sede).trim() }),
      ...(req.body.solicitante && { solicitante: String(req.body.solicitante).trim() }),
      ...(req.body.motivo !== undefined && observaciones === undefined && { motivo: req.body.motivo, observaciones: req.body.motivo }),
      ...(req.body.custodio_documento && { custodio_documento: String(req.body.custodio_documento).trim() }),
      ...(req.body.cantidad && { cantidad: parseInt(req.body.cantidad, 10) }),
      updated_at: new Date().toISOString()
    };

    // 3. Persistir en la tabla prestamos
    let data = null;
    let error = null;

    try {
      const resSupabase = await supabase
        .from('prestamos')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      data = resSupabase.data;
      error = resSupabase.error;
    } catch (e) {
      error = e;
    }

    // Fallback con pool relacional de PostgreSQL si supabase client no está autenticado o falla
    if (error || !data) {
      try {
        const fields = [];
        const values = [];
        let idx = 1;

        for (const [key, val] of Object.entries(updateData)) {
          fields.push(`${key} = $${idx++}`);
          values.push(val);
        }
        values.push(id);

        const pgRes = await pool.query(
          `UPDATE prestamos SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
          values
        );

        if (pgRes.rows && pgRes.rows.length > 0) {
          data = pgRes.rows[0];
          error = null;
        } else {
          return res.status(404).json({ error: `Préstamo con ID ${id} no encontrado.` });
        }
      } catch (pgErr) {
        if (!error) error = pgErr;
      }
    }

    if (error) {
      console.error('Error al actualizar en Supabase:', error.message);
      return res.status(500).json({ error: error.message });
    }

    try {
      await registrarMovimiento(pool, {
        tipo: 'Actualización',
        elemento_nombre: data.placa_activo ? `Préstamo ${data.placa_activo}` : `Préstamo #${id}`,
        placa_o_id: data.placa_activo || String(id),
        cantidad: data.cantidad || 1,
        responsable: data.solicitante || 'Operador',
        sede: data.sede || 'Medellín',
        detalles: `Modificación de préstamo #${id}. Fecha esperada: ${data.fecha_devolucion_esperada || 'N/A'}`
      });
    } catch (_) {}

    return res.status(200).json({
      success: true,
      mensaje: 'Préstamo actualizado exitosamente',
      prestamo: data,
      data
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export default {
  actualizarPrestamo
};
