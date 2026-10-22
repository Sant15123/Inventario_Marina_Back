import { jest, describe, it, expect, afterEach, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/db.js';
import { supabase, supabaseAdmin } from '../../src/config/supabase.js';

describe('Suite de Pruebas: PUT /api/auth/cambiar-password', () => {
  function makeToken(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({
      ...payload,
      exp: Math.floor(Date.now() / 1000) + 3600
    })).toString('base64url');
    return `${header}.${body}.mock_signature`;
  }

  const validToken = makeToken({
    id: '834a1bc6-60e3-4401-bb6e-fe3e280575e3',
    email: 'santiago.galeano@fmo.org',
    documento: '1064123987',
    nombre_completo: 'Santiago Galeano',
    rol: 'administrador',
    sede: 'Medellín'
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('debe rechazar la petición con 401 si no se envía Authorization header', async () => {
    const res = await request(app)
      .put('/api/auth/cambiar-password')
      .send({
        password_actual: 'ActualPass123!',
        nueva_password: 'NuevaPass2026@'
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Acceso no autorizado/i);
  });

  it('debe validar que los campos obligatorios no vengan vacíos (400)', async () => {
    const res = await request(app)
      .put('/api/auth/cambiar-password')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        password_actual: '',
        nueva_password: 'NuevaPass2026@'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/contraseña actual es obligatoria/i);
  });

  it('debe validar los estándares de seguridad de la nueva contraseña (400)', async () => {
    const res = await request(app)
      .put('/api/auth/cambiar-password')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        password_actual: 'ActualPass123!',
        nueva_password: 'insegura'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/requisitos de seguridad/i);
  });

  it('debe rechazar si la nueva contraseña es idéntica a la actual (400)', async () => {
    const res = await request(app)
      .put('/api/auth/cambiar-password')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        password_actual: 'MismaClave2026@',
        nueva_password: 'MismaClave2026@'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no puede ser idéntica/i);
  });

  it('debe devolver 400 si la contraseña actual no es válida en Supabase Auth', async () => {
    jest.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValueOnce({
      data: null,
      error: { message: 'Invalid login credentials' }
    });

    const res = await request(app)
      .put('/api/auth/cambiar-password')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        password_actual: 'WrongPass123!',
        nueva_password: 'NuevaValidaPass2026@'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/contraseña actual ingresada es incorrecta/i);
  });

  it('debe devolver 500 si falla la actualización administrativa en Supabase Auth', async () => {
    jest.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValueOnce({
      data: { user: { id: 'test-user-id' } },
      error: null
    });

    jest.spyOn(supabaseAdmin.auth.admin, 'updateUserById').mockResolvedValueOnce({
      data: null,
      error: { message: 'Supabase connection timeout' }
    });

    const res = await request(app)
      .put('/api/auth/cambiar-password')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        password_actual: 'admin123',
        nueva_password: 'NuevaValidaPass2026@'
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Error al actualizar la contraseña en Supabase/i);
  });

  it('debe proteger y no permitir modificar la clave de Santiago Suárez Duran', async () => {
    const santiagoSuarezToken = makeToken({
      id: 'c5ae4f6b-8126-406f-9127-ff6fa7c8bf12',
      email: 'ssuarez@fundaorth.org',
      documento: '1038648135',
      nombre_completo: 'Santiago Suárez Duran',
      rol: 'usuario'
    });

    const res = await request(app)
      .put('/api/auth/cambiar-password')
      .set('Authorization', `Bearer ${santiagoSuarezToken}`)
      .send({
        password_actual: 'CualquierClave123!',
        nueva_password: 'NuevaValidaPass2026@'
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Santiago Suárez Duran/i);
  });

  it('debe retornar 200 y mensaje de éxito cuando la contraseña se actualiza correctamente con bcrypt', async () => {
    jest.spyOn(supabaseAdmin.auth.admin, 'updateUserById').mockResolvedValueOnce({
      data: { user: { id: '834a1bc6-60e3-4401-bb6e-fe3e280575e3' } },
      error: null
    });

    const res = await request(app)
      .put('/api/auth/cambiar-password')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        password_actual: 'admin123',
        nueva_password: 'NuevaClaveSegura2026@'
      });

    if (res.status !== 200) {
      console.log('Fallo test 143 res.body:', res.body, 'res.status:', res.status);
    }
    expect(res.status).toBe(200);
    expect(res.body.mensaje).toBe('Contraseña actualizada exitosamente');
  });

  afterAll(async () => {
    // Restaurar contraseña original de Santiago Galeano y cerrar conexión
    try {
      const bcrypt = (await import('bcrypt')).default;
      const originalHash = await bcrypt.hash('admin123', 10);
      await pool.query('UPDATE perfiles SET password = $1 WHERE documento = $2', [originalHash, '1064123987']);
      await pool.end();
    } catch {
      // Ignorar
    }
  });
});
