import express from 'express';
import {
  getMobiliario,
  getSiguientePlacaMobiliario,
  createMobiliario,
  updateMobiliario,
  deleteMobiliario
} from '../controllers/mobiliarioController.js';

const router = express.Router();

// GET /api/mobiliario/siguiente-placa (debe ir antes de /:id)
router.get('/siguiente-placa', getSiguientePlacaMobiliario);

// GET /api/mobiliario
router.get('/', getMobiliario);

// POST /api/mobiliario
router.post('/', createMobiliario);

// PUT /api/mobiliario/:id
router.put('/:id', updateMobiliario);

// DELETE /api/mobiliario/:id
router.delete('/:id', deleteMobiliario);

export default router;
