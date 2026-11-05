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

    // 2. Resolver el ID real en la tabla prestamos si viene como UUID, sintético (ej. 500275) o radicado
    let targetPrestamoId = id;

    // A. Si es un ID sintético de historial (ej. >= 500000 o "mov-hist-...")
    let syntheticHistId = null;
    if (typeof id === 'string' && id.startsWith('mov-hist-')) {
      syntheticHistId = parseInt(id.replace('mov-hist-', ''), 10);
    } else if (!isNaN(Number(id)) && Number(id) >= 500000) {
      syntheticHistId = Number(id) - 500000;
    }

    if (syntheticHistId) {
      try {
        const histRes = await pool.query(
          'SELECT placa_o_id, usuario_id, responsable FROM historial_movimientos WHERE id = $1',
          [syntheticHistId]
        );
        if (histRes.rows.length > 0) {
          const { placa_o_id, usuario_id } = histRes.rows[0];
          // Buscar el préstamo activo correspondiente a este activo
          const matchRes = await pool.query(
            `SELECT id FROM prestamos 
             WHERE (LOWER(placa_activo) = LOWER($1) OR ($2::uuid IS NOT NULL AND usuario_id = $2::uuid))
             ORDER BY (CASE WHEN estado = 'Activo' THEN 0 ELSE 1 END), id DESC 
             LIMIT 1`,
            [placa_o_id || '', usuario_id || null]
          );
          if (matchRes.rows.length > 0) {
            targetPrestamoId = matchRes.rows[0].id;
          }
        }
      } catch (histErr) {
        console.warn('Aviso resolviendo ID sintético de historial:', histErr.message);
      }
    }

    // B. Si id es UUID (ej. usuario_id, solicitud_id o UUID general)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(targetPrestamoId).trim());
    if (isUuid) {
      try {
        // 1. Buscar si coincide con usuario_id en prestamos
        const uRes = await pool.query(
          `SELECT id FROM prestamos WHERE usuario_id = $1::uuid ORDER BY (CASE WHEN estado = 'Activo' THEN 0 ELSE 1 END), id DESC LIMIT 1`,
          [targetPrestamoId]
        );
        if (uRes.rows.length > 0) {
          targetPrestamoId = uRes.rows[0].id;
        } else {
          // 2. Buscar si coincide con solicitud_id en solicitudes_inventario
          const solRes = await pool.query(
            `SELECT s.usuario_id, i.item_id, s.sede FROM solicitudes_inventario s
             LEFT JOIN items_solicitud i ON s.id = i.solicitud_id
             WHERE s.id = $1::uuid LIMIT 1`,
            [targetPrestamoId]
          );
          if (solRes.rows.length > 0) {
            const { usuario_id, item_id } = solRes.rows[0];
            const pMatch = await pool.query(
              `SELECT id FROM prestamos 
               WHERE (usuario_id = $1::uuid OR LOWER(placa_activo) = LOWER($2))
               ORDER BY (CASE WHEN estado = 'Activo' THEN 0 ELSE 1 END), id DESC LIMIT 1`,
              [usuario_id || null, item_id || '']
            );
            if (pMatch.rows.length > 0) {
              targetPrestamoId = pMatch.rows[0].id;
            }
          }
        }
      } catch (uuidErr) {
        console.warn('Aviso resolviendo UUID a ID de préstamo:', uuidErr.message);
      }
    }

    // C. Si aún no existe el préstamo por ID y se envió placa o placa_activo en body
    if (isNaN(Number(targetPrestamoId))) {
      const placaRef = req.body.placa || req.body.placa_activo || req.body.itemId;
      if (placaRef) {
        try {
          const placaRes = await pool.query(
            `SELECT id FROM prestamos WHERE LOWER(placa_activo) = LOWER($1) ORDER BY (CASE WHEN estado = 'Activo' THEN 0 ELSE 1 END), id DESC LIMIT 1`,
            [String(placaRef).trim()]
          );
          if (placaRes.rows.length > 0) {
            targetPrestamoId = placaRes.rows[0].id;
          }
        } catch (_) {}
      }
    }

    // 3. Construir objeto de actualización con los nombres exactos de Supabase
    const fechaFormateada = fechaEsperada ? String(fechaEsperada).split('T')[0] : undefined;
    const updateData = {
      ...(fechaFormateada && { fecha_devolucion_esperada: fechaFormateada }),
      ...(observaciones !== undefined && { observaciones, motivo: observaciones }),
      ...(sede && { sede: String(sede).trim() }),
      ...(req.body.solicitante && { solicitante: String(req.body.solicitante).trim() }),
      ...(req.body.motivo !== undefined && observaciones === undefined && { motivo: req.body.motivo, observaciones: req.body.motivo }),
      ...(req.body.custodio_documento && { custodio_documento: String(req.body.custodio_documento).trim() }),
      ...(req.body.cantidad && { cantidad: parseInt(req.body.cantidad, 10) }),
      updated_at: new Date().toISOString()
    };

    // 4. Persistir en la tabla prestamos
    let data = null;
    let error = null;

    try {
      const resSupabase = await supabase
        .from('prestamos')
        .update(updateData)
        .eq('id', targetPrestamoId)
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
        values.push(targetPrestamoId);

        const pgRes = await pool.query(
          `UPDATE prestamos SET ${fields.join(', ')} WHERE id::text = $${idx}::text RETURNING *`,
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

    // 5. Si se actualizó la fecha esperada, sincronizar con el activo si está en campo
    if (fechaFormateada && data.placa_activo) {
      try {
        await pool.query(
          `UPDATE activos SET fecha_devolucion = $1 WHERE LOWER(placa) = LOWER($2) AND LOWER(estado) = 'en campo'`,
          [fechaFormateada, data.placa_activo]
        );
      } catch (_) {}
    }

    // 6. Registrar movimiento de auditoría
    try {
      await registrarMovimiento(pool, {
        tipo: 'Actualización',
        elemento_nombre: data.placa_activo ? `Préstamo ${data.placa_activo}` : `Préstamo #${targetPrestamoId}`,
        placa_o_id: data.placa_activo || String(targetPrestamoId),
        cantidad: data.cantidad || 1,
        responsable: data.solicitante || 'Operador',
        sede: data.sede || 'Medellín',
        detalles: `Modificación de préstamo #${targetPrestamoId}. Fecha esperada: ${data.fecha_devolucion_esperada || 'N/A'}`
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

