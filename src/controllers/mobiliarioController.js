import MobiliarioModel from '../models/Mobiliario.js';

/**
 * GET /api/mobiliario
 * Listar registros de mobiliario con soporte para filtros por sede, categoría y búsqueda por texto.
 */
export const getMobiliario = async (req, res) => {
  try {
    const { sede, categoria, search, q } = req.query;
    const searchTerm = search || q || '';

    const items = await MobiliarioModel.findAll({
      sede,
      categoria,
      search: searchTerm
    });

    return res.status(200).json({
      success: true,
      count: items.length,
      data: items
    });
  } catch (error) {
    console.error('Error al obtener mobiliario:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener registros de mobiliario',
      error: error.message
    });
  }
};

/**
 * GET /api/mobiliario/siguiente-placa
 * Consultar el último registro que empiece por MOB- y devolver el siguiente correlativo sugerido.
 */
export const getSiguientePlacaMobiliario = async (req, res) => {
  try {
    const siguientePlaca = await MobiliarioModel.getSiguientePlaca();

    return res.status(200).json({
      success: true,
      data: {
        siguientePlaca,
        placa: siguientePlaca
      }
    });
  } catch (error) {
    console.error('Error al calcular siguiente placa de mobiliario:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al calcular siguiente placa de mobiliario',
      error: error.message
    });
  }
};

/**
 * POST /api/mobiliario
 * Registrar nuevo mobiliario validando placa, nombre, categoría y sede obligatorios.
 */
export const createMobiliario = async (req, res) => {
  try {
    const {
      placa,
      nombre,
      categoria,
      sede,
      ubicacion_especifica,
      material,
      color,
      dimensiones,
      estado_conservacion,
      cantidad,
      fecha_adquisicion,
      proveedor_origen,
      observaciones
    } = req.body || {};

    // Validar campos obligatorios
    const missing = [];
    if (!placa || !String(placa).trim()) missing.push('placa');
    if (!nombre || !String(nombre).trim()) missing.push('nombre');
    if (!categoria || !String(categoria).trim()) missing.push('categoria');
    if (!sede || !String(sede).trim()) missing.push('sede');

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Los siguientes campos son obligatorios: ${missing.join(', ')}`,
        missingFields: missing
      });
    }

    // Verificar unicidad de placa
    const existePlaca = await MobiliarioModel.findByPlaca(String(placa).trim());
    if (existePlaca) {
      return res.status(400).json({
        success: false,
        message: `Ya existe un mobiliario registrado con la placa "${placa.trim()}".`
      });
    }

    const nuevoMobiliario = await MobiliarioModel.create({
      placa: String(placa).trim(),
      nombre: String(nombre).trim(),
      categoria: String(categoria).trim(),
      sede: String(sede).trim(),
      ubicacion_especifica,
      material,
      color,
      dimensiones,
      estado_conservacion,
      cantidad,
      fecha_adquisicion,
      proveedor_origen,
      observaciones
    });

    return res.status(201).json({
      success: true,
      message: 'Mobiliario registrado exitosamente',
      data: nuevoMobiliario
    });
  } catch (error) {
    console.error('Error al crear mobiliario:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al crear mobiliario',
      error: error.message
    });
  }
};

/**
 * PUT /api/mobiliario/:id
 * Actualizar detalles o estado de conservación por ID (UUID).
 */
export const updateMobiliario = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'El ID del mobiliario es requerido'
      });
    }

    // Verificar existencia previa
    const existente = await MobiliarioModel.findById(id);
    if (!existente) {
      return res.status(404).json({
        success: false,
        message: `No se encontró ningún mobiliario con ID ${id}`
      });
    }

    // Si se actualiza la placa, validar que no choque con otra
    if (req.body.placa && req.body.placa.trim().toLowerCase() !== existente.placa.toLowerCase()) {
      const repetida = await MobiliarioModel.findByPlaca(req.body.placa.trim());
      if (repetida && repetida.id !== id) {
        return res.status(400).json({
          success: false,
          message: `La placa "${req.body.placa.trim()}" ya está en uso por otro mobiliario.`
        });
      }
    }

    const updated = await MobiliarioModel.update(id, req.body);

    return res.status(200).json({
      success: true,
      message: 'Mobiliario actualizado exitosamente',
      data: updated
    });
  } catch (error) {
    console.error('Error al actualizar mobiliario:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar mobiliario',
      error: error.message
    });
  }
};

/**
 * DELETE /api/mobiliario/:id
 * Eliminar mobiliario por ID.
 */
export const deleteMobiliario = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'El ID del mobiliario es requerido'
      });
    }

    const existente = await MobiliarioModel.findById(id);
    if (!existente) {
      return res.status(404).json({
        success: false,
        message: `No se encontró ningún mobiliario con ID ${id}`
      });
    }

    const eliminado = await MobiliarioModel.delete(id);

    return res.status(200).json({
      success: true,
      message: 'Mobiliario eliminado exitosamente',
      data: eliminado
    });
  } catch (error) {
    console.error('Error al eliminar mobiliario:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al eliminar mobiliario',
      error: error.message
    });
  }
};
