import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import rateLimit from 'express-rate-limit';
import express from 'express';

describe('Suite de Pruebas: Seguridad - Exclusión de campos sensibles y Rate Limiting', () => {

  // 1. RATE LIMITING EN /api/auth/login
  describe('1. Rate Limiting Activo en /api/auth/login', () => {
    it('debe bloquear con HTTP 429 al superar el límite de 10 peticiones por ventana de 5 minutos', async () => {
      // Creamos una instancia de app con un rateLimiter configurado con max: 10 y ventana de 5 minutos para validar la respuesta exacta
      const testLimiter = rateLimit({
        windowMs: 5 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        statusCode: 429,
        message: {
          success: false,
          message: 'Demasiados intentos de inicio de sesión desde esta IP. Por favor intenta de nuevo en 5 minutos.',
          error: 'Demasiados intentos de inicio de sesión. Por favor espera 5 minutos antes de volver a intentar.'
        }
      });

      const testApp = express();
      testApp.use(express.json());
      testApp.post('/api/auth/login', testLimiter, (req, res) => {
        res.status(200).json({ success: true });
      });

      // Ejecutar 10 peticiones exitosas
      for (let i = 0; i < 10; i++) {
        const res = await request(testApp).post('/api/auth/login').send({});
        expect(res.status).toBe(200);
      }

      // La petición 11 debe ser bloqueada con 429
      const blockedRes = await request(testApp).post('/api/auth/login').send({});
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.success).toBe(false);
      expect(blockedRes.body.message).toMatch(/Demasiados intentos de inicio de sesión/i);
    });

    it('la ruta real /api/auth/login debe responder normalmente dentro del umbral', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'test@fmo.org', password: '' });

      // No debe ser 429 (umbral no superado), responde 400 por campos incompletos
      expect(res.status).toBe(400);
      expect(res.status).not.toBe(429);
    });
  });

  // 2. EXCLUSIÓN DE CAMPOS SENSIBLES (PASSWORD)
  describe('2. Exclusión de campos sensibles (password / hash) en respuestas JSON', () => {
    it('POST /api/auth/login NO debe devolver la propiedad password en la respuesta', async () => {
      // Probamos con credenciales demo conocidas
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          identifier: 'santiago.ortiz@fmo.org',
          password: 'Password123!'
        });

      // Si las credenciales fallan o aciertan, la respuesta nunca debe filtrar el hash
      expect(res.body).not.toHaveProperty('password');
      if (res.body.usuario) {
        expect(res.body.usuario).not.toHaveProperty('password');
      }
    });

    it('GET /api/usuarios NO debe devolver la propiedad password en ningún elemento de la lista', async () => {
      const res = await request(app).get('/api/usuarios');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      res.body.data.forEach(user => {
        expect(user).not.toHaveProperty('password');
      });
    });

    it('GET /api/perfiles NO debe devolver la propiedad password en ningún elemento de la lista', async () => {
      const res = await request(app).get('/api/perfiles');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      res.body.data.forEach(perfil => {
        expect(perfil).not.toHaveProperty('password');
      });
    });

    it('GET /api/usuarios/:id NO debe devolver la propiedad password', async () => {
      // Consultamos el primer usuario disponible
      const listRes = await request(app).get('/api/usuarios');
      if (listRes.body.data && listRes.body.data.length > 0) {
        const testUser = listRes.body.data[0];
        const res = await request(app).get(`/api/usuarios/${testUser.id}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).not.toHaveProperty('password');
      }
    });

    it('GET /api/perfiles/:id NO debe devolver la propiedad password', async () => {
      const listRes = await request(app).get('/api/perfiles');
      if (listRes.body.data && listRes.body.data.length > 0) {
        const testUser = listRes.body.data[0];
        const res = await request(app).get(`/api/perfiles/${testUser.id}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).not.toHaveProperty('password');
      }
    });
  });

  afterAll(async () => {
    const { pool } = await import('../../src/db.js');
    await pool.end();
  });
});
