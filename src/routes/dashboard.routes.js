import { Router } from 'express';
import { getDashboardKPIs } from '../controllers/dashboardController.js';

const router = Router();

// GET /api/dashboard/kpis - Consolidado de métricas rápidas del inventario
router.get('/kpis', getDashboardKPIs);

// GET /api/dashboard - Fallback raíz para métricas
router.get('/', getDashboardKPIs);

export default router;
