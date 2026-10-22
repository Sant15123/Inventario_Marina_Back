import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/db.js';
import { registrarMovimiento } from '../../src/services/historial.service.js';

describe('Suite de Pruebas: Historial de Movimientos y Filtrado Personal por Rol', () => {
  const testUserId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
  const testUserDoc = '1040321654';
  const testUserName = 'Yury Torres';

  function makeToken(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({
      ...payload,
      exp: Math.floor(Date.now() / 1000) + 3600
    })).toString('base64url');
    return `${header}.${body}.mock_sig`;
  }

  beforeAll(async () => {
    // 1. Movimiento personal de préstamo para el usuario de prueba
    await registrarMovimiento(pool, {
      tipo: 'Préstamo',
      elemento_nombre: 'Laptop Lenovo ThinkPad Personal Test',
      placa_o_id: 'ACT-TEST-PERSONAL-01',
      cantidad: 1,
      responsable: testUserName,
      documento_responsable: testUserDoc,
      usuario_id: testUserId,
      sede: 'Medellín',
      detalles: 'Préstamo de equipo para talleres formativos STEAM'
    });

    // 2. Movimiento personal de entrega de consumibles para el usuario de prueba
    await registrarMovimiento(pool, {
      tipo: 'Entrega',
      elemento_nombre: 'Kit Arduino Educativo',
      placa_o_id: 'MAT-TEST-PERSONAL-02',
      cantidad: 2,
      responsable: testUserName,
      documento_responsable: testUserDoc,
      usuario_id: testUserId,
      sede: 'Medellín',
      detalles: 'Salida de material para taller de robótica'
    });

    // 3. Evento administrativo global (Alta de insumos de bodega)
    await registrarMovimiento(pool, {
      tipo: 'Ingreso',
      elemento_nombre: 'Lote de Resistencias y LEDs',
      placa_o_id: 'MAT-GLOBAL-01',
      cantidad: 100,
      responsable: 'Bodega Central',
      sede: 'Medellín',
      detalles: 'Alta de insumos de bodega central sin custodio asignado'
    });

    // 4. Evento administrativo global (Creación de proyecto STEAM)
    await registrarMovimiento(pool, {
      tipo: 'Actualización',
      elemento_nombre: 'Proyecto STEAM Semillero Norte',
      placa_o_id: 'PROY-GLOBAL-02',
      cantidad: 1,
      responsable: 'Coordinación FMO',
      sede: 'Medellín',
      detalles: 'Registro de nuevo proyecto STEAM institucional'
    });
  });

  afterAll(async () => {
    await pool.query("DELETE FROM historial_movimientos WHERE placa_o_id LIKE '%TEST-PERSONAL%' OR placa_o_id LIKE '%GLOBAL%'");
    await pool.end();
  });

  describe('Auditoría Global (Administrador / Supervisor)', () => {
    it('GET /api/historial sin credenciales o con rol administrador debe responder con listado completo global', async () => {
      const adminToken = makeToken({
        id: 'admin-uuid',
        nombre: 'Santiago Ortiz',
        rol: 'administrador',
        documento: '100123456'
      });

      const res = await request(app)
        .get('/api/historial')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.modo).toBe('global');
      expect(Array.isArray(res.body.data)).toBe(true);

      // Debe incluir tanto movimientos personales como administrativos globales
      const placas = res.body.data.map((m) => m.placa_o_id);
      expect(placas).toContain('ACT-TEST-PERSONAL-01');
      expect(placas).toContain('MAT-GLOBAL-01');
    });

    it('GET /api/historial con rol supervisor debe acceder a la auditoría global completa', async () => {
      const superToken = makeToken({
        id: 'supervisor-uuid',
        nombre: 'Nicolas Tamayo',
        rol: 'supervisor',
        documento: '1002345678'
      });

      const res = await request(app)
        .get('/api/historial')
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(200);
      expect(res.body.modo).toBe('global');
      const detalles = res.body.data.map((m) => m.detalles);
      expect(detalles.some((d) => d && d.includes('Alta de insumos de bodega'))).toBe(true);
    });
  });

  describe('Filtrado Restricto de Historial Personal para Rol Usuario', () => {
    it('GET /api/historial con token de rol usuario debe filtrar estrictamente registros individuales', async () => {
      const userToken = makeToken({
        id: testUserId,
        nombre: testUserName,
        rol: 'usuario',
        documento: testUserDoc
      });

      const res = await request(app)
        .get('/api/historial')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.modo).toBe('personal');
      expect(Array.isArray(res.body.data)).toBe(true);

      // Debe incluir los movimientos personales donde es responsable/beneficiario
      const placas = res.body.data.map((m) => m.placa_o_id);
      expect(placas).toContain('ACT-TEST-PERSONAL-01');
      expect(placas).toContain('MAT-TEST-PERSONAL-02');

      // NO debe exponer eventos administrativos globales (altas de bodega o proyectos)
      expect(placas).not.toContain('MAT-GLOBAL-01');
      expect(placas).not.toContain('PROY-GLOBAL-02');

      // Todos los registros devueltos deben pertenecer al usuario
      res.body.data.forEach((m) => {
        const matchesUser =
          (m.responsable && m.responsable.toLowerCase().includes(testUserName.toLowerCase())) ||
          m.usuario_id === testUserId ||
          m.documento_responsable === testUserDoc;
        expect(matchesUser).toBe(true);
      });
    });

    it('GET /api/historial con query params ?rol=usuario&documento=... debe restringir al histórico individual', async () => {
      const res = await request(app)
        .get('/api/historial')
        .query({
          rol: 'usuario',
          documento: testUserDoc,
          usuario_id: testUserId
        });

      expect(res.status).toBe(200);
      expect(res.body.modo).toBe('personal');
      const placas = res.body.data.map((m) => m.placa_o_id);
      expect(placas).toContain('ACT-TEST-PERSONAL-01');
      expect(placas).not.toContain('MAT-GLOBAL-01');
    });
  });

  describe('Endpoint Dedicado GET /api/historial/personal', () => {
    it('debe responder 400 si no se envían datos de identificación de usuario', async () => {
      const res = await request(app).get('/api/historial/personal');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('identificación de usuario');
    });

    it('debe responder 200 con el historial personal del usuario autenticado vía JWT', async () => {
      const userToken = makeToken({
        id: testUserId,
        nombre: testUserName,
        rol: 'usuario',
        documento: testUserDoc
      });

      const res = await request(app)
        .get('/api/historial/personal')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.modo).toBe('personal');
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);

      const tipos = res.body.data.map((m) => m.tipo);
      expect(tipos).toContain('Préstamo');
      expect(tipos).toContain('Entrega');
    });
  });

  describe('Filtros Adicionales en Historial', () => {
    it('GET /api/historial?tipo=Préstamo - debe filtrar por tipo de movimiento', async () => {
      const res = await request(app).get('/api/historial').query({ tipo: 'Préstamo' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      res.body.data.forEach((item) => {
        expect(item.tipo.toLowerCase()).toBe('préstamo');
      });
    });

    it('PUT /api/prestamos/:id/devolver con id inexistente - debe retornar 404', async () => {
      const res = await request(app).put('/api/prestamos/9999999/devolver');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
