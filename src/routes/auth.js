import { Router } from 'express';
import { verificarAutenticacion } from '../middleware/verifyToken.js';
import * as authController from '../controllers/authController.js';

const router = Router();

// POST /api/auth/login
router.post('/login', authController.login);

// PUT y POST /api/auth/cambiar-password
router.put('/cambiar-password', verificarAutenticacion, authController.cambiarPassword);
router.post('/cambiar-password', verificarAutenticacion, authController.cambiarPassword);

export default router;
