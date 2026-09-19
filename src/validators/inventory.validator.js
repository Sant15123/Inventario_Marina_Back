import Joi from 'joi';

export const inventorySchema = Joi.object({
  nombre: Joi.string().min(2).max(100).required().messages({
    'string.base': 'El nombre debe ser un texto',
    'string.min': 'El nombre debe tener al menos 2 caracteres',
    'string.max': 'El nombre no puede exceder 100 caracteres',
    'any.required': 'El nombre es obligatorio'
  }),
  descripcion: Joi.string().max(500).allow('').optional().messages({
    'string.max': 'La descripción no puede exceder 500 caracteres'
  }),
  cantidad: Joi.number().integer().min(0).required().messages({
    'number.base': 'La cantidad debe ser un número',
    'number.integer': 'La cantidad debe ser un número entero',
    'number.min': 'La cantidad no puede ser negativa',
    'any.required': 'La cantidad es obligatoria'
  }),
  precio: Joi.number().positive().precision(2).required().messages({
    'number.base': 'El precio debe ser un número',
    'number.positive': 'El precio debe ser mayor a 0',
    'number.precision': 'El precio debe tener máximo 2 decimales',
    'any.required': 'El precio es obligatorio'
  }),
  categoria: Joi.string().max(50).optional().messages({
    'string.max': 'La categoría no puede exceder 50 caracteres'
  }),
  ubicacion: Joi.string().max(100).optional().messages({
    'string.max': 'La ubicación no puede exceder 100 caracteres'
  })
});

export const inventoryUpdateSchema = Joi.object({
  nombre: Joi.string().min(2).max(100).optional(),
  descripcion: Joi.string().max(500).allow('').optional(),
  cantidad: Joi.number().integer().min(0).optional(),
  precio: Joi.number().positive().precision(2).optional(),
  categoria: Joi.string().max(50).optional(),
  ubicacion: Joi.string().max(100).optional()
}).min(1).messages({
  'object.min': 'Al menos un campo debe ser proporcionado para actualizar'
});