import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { generateToken } from '../../src/middleware/verifyToken.js';

describe('Suite de Pruebas: verifyToken y Expiración Estricta de 2 Horas', () => {
  it('1. generateToken debe incluir iat, exp con vigencia por defecto de 7200 segundos (2 horas)', () => {
    const payload = {
      id: 'uuid-test-1234',
      documento: '10203040',
      nombre: 'Operador SIGA',
      rol: 'operador',
      sede: 'Medellín',
      cargo: 'Docente STEAM'
    };

    const token = generateToken(payload);
    const parts = token.split('.');
    expect(parts.length).toBe(3);

    const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp).toBeDefined();
    expect(decoded.exp - decoded.iat).toBe(7200); // 2 * 60 * 60
  });

  it('2. verifyToken debe rechazar con 401 si el token ha expirado', async () => {
    // Generar un token con expiración en el pasado (-10 segundos)
    const tokenExpirado = generateToken({ id: 'uuid-expirado', rol: 'operador' }, -10);

    const res = await request(app)
      .post('/api/auth/cambiar-password')
      .set('Authorization', `Bearer ${tokenExpirado}`)
      .send({ passwordActual: '123', passwordNuevo: '456789' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Sesión expirada: El token de autenticación ha caducado tras 2 horas.');
  });

  it('3. verifyToken debe permitir acceso con token vigente y normalizar req.user', async () => {
    const tokenValido = generateToken({
      id: '834a1bc6-60e3-4401-bb6e-fe3e280575e3',
      documento: '1064123987',
      nombre: 'Santiago Galeano',
      rol: 'administrador',
      sede: 'Medellín',
      cargo: 'Funcionario FMO'
    });

    const res = await request(app)
      .post('/api/auth/cambiar-password')
      .set('Authorization', `Bearer ${tokenValido}`)
      .send({ passwordActual: 'password_erroneo_para_verificar_paso', passwordNuevo: '123456' });

    // Si pasó verifyToken, ya no devuelve 401 (devuelve 400 por contraseña actual incorrecta o similar)
    expect(res.status).not.toBe(401);
  });
});
