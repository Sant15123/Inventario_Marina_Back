import request from 'supertest';
import app from '../../src/app.js';
import { generateToken } from '../../src/middleware/verifyToken.js';

describe('Suite de Pruebas: Middlewares de Autorización y Control de Roles (SIGA)', () => {
  // Tokens para cada rol según el modelo de datos de SIGA
  const adminToken = generateToken({
    id: '11111111-1111-1111-1111-111111111111',
    documento: '100123456',
    email: 'admin@fmo.org',
    nombre_completo: 'Administrador General',
    rol: 'administrador'
  });

  const operadorToken = generateToken({
    id: '22222222-2222-2222-2222-222222222222',
    documento: '1003456789',
    email: 'operador@fmo.org',
    nombre_completo: 'Dolly Montoya Operador',
    rol: 'operador'
  });

  const supervisorToken = generateToken({
    id: '33333333-3333-3333-3333-333333333333',
    documento: '1002345678',
    email: 'supervisor@fmo.org',
    nombre_completo: 'Nicolas Tamayo Supervisor',
    rol: 'supervisor'
  });

  const usuarioToken = generateToken({
    id: '44444444-4444-4444-4444-444444444444',
    documento: '1040321654',
    email: 'usuario@fmo.org',
    nombre_completo: 'Yury Torres Usuario',
    rol: 'usuario'
  });

  // 1. RESTRICCIONES DE SUPERVISOR (SOLO LECTURA)
  describe('Rol Supervisor: Acceso exclusivo de solo lectura (Bloqueo de mutaciones)', () => {
    it('debe rechazar a un Supervisor en POST /api/activos con 403 y mensaje restrictivo', async () => {
      const res = await request(app)
        .post('/api/activos')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          placa: 'TEST-SUPER-01',
          nombre: 'Equipo de Prueba'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Acceso denegado: Esta acción requiere permisos de Administrador.');
    });

    it('debe rechazar a un Supervisor en POST /api/prestamos con 403 y mensaje restrictivo', async () => {
      const res = await request(app)
        .post('/api/prestamos')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          item_id: 'P1001',
          solicitante: 'Prueba',
          fecha_devolucion_esperada: '2026-12-31'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('El rol Supervisor tiene permisos exclusivos de auditoría y solo lectura.');
    });

    it('debe rechazar a un Supervisor en POST /api/consumibles/entregas con 403', async () => {
      const res = await request(app)
        .post('/api/consumibles/entregas')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          material_id: 'MAT001',
          cantidad: 1,
          responsable: 'Prueba'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('El rol Supervisor tiene permisos exclusivos de auditoría y solo lectura.');
    });

    it('debe rechazar a un Supervisor en PUT /api/prestamos/:id/devolver con 403', async () => {
      const res = await request(app)
        .put('/api/prestamos/1/devolver')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('El rol Supervisor tiene permisos exclusivos de auditoría y solo lectura.');
    });
  });

  // 2. DELIMITACIÓN DE OPERADOR (OPERATIVO EN BODEGA / CAMPO)
  describe('Rol Operador: Permisos delimitados de campo/bodega vs Catálogo Maestro', () => {
    it('debe rechazar a un Operador en POST /api/activos con 403 (Requiere Administrador)', async () => {
      const res = await request(app)
        .post('/api/activos')
        .set('Authorization', `Bearer ${operadorToken}`)
        .send({
          placa: 'TEST-OPER-01',
          nombre: 'Equipo no permitido'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Esta acción requiere permisos de Administrador.');
    });

    it('debe rechazar a un Operador en POST /api/usuarios con 403 (No puede administrar usuarios)', async () => {
      const res = await request(app)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${operadorToken}`)
        .send({
          documento: '987654321',
          nombre_completo: 'Intento Usuario',
          email: 'intento@fmo.org'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Esta acción requiere permisos de Administrador.');
    });

    it('debe rechazar a un Operador en DELETE /api/activos/:id con 403', async () => {
      const res = await request(app)
        .delete('/api/activos/P1001')
        .set('Authorization', `Bearer ${operadorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Esta acción requiere permisos de Administrador.');
    });

    it('debe permitir a un Operador superar la barrera de autorización en POST /api/prestamos (requireOperadorOAdmin)', async () => {
      // Al pasar la autorización, si faltan datos obligatorios validará la lógica del endpoint (400) o procesará
      const res = await request(app)
        .post('/api/prestamos')
        .set('Authorization', `Bearer ${operadorToken}`)
        .send({});

      // No debe ser 403 (autorización aprobada), responde 400 por validación de campos requeridos
      expect(res.status).toBe(400);
      expect(res.status).not.toBe(403);
    });

    it('debe permitir a un Operador superar la barrera de autorización en POST /api/consumibles/entregas', async () => {
      const res = await request(app)
        .post('/api/consumibles/entregas')
        .set('Authorization', `Bearer ${operadorToken}`)
        .send({});

      // Pasa el middleware y falla con 400 por datos vacíos
      expect(res.status).toBe(400);
      expect(res.status).not.toBe(403);
    });
  });

  // 3. ROL ADMINISTRADOR (ACCESO TOTAL)
  describe('Rol Administrador: Acceso total a infraestructura y operaciones', () => {
    it('debe superar la autorización de catálogo en POST /api/activos', async () => {
      const res = await request(app)
        .post('/api/activos')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({}); // Envío vacío para chequear paso del middleware

      expect(res.status).toBe(400); // 400 indica que superó el middleware 403
      expect(res.status).not.toBe(403);
    });

    it('debe superar la autorización operativa en POST /api/prestamos', async () => {
      const res = await request(app)
        .post('/api/prestamos')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.status).not.toBe(403);
    });
  });

  // 4. ROL USUARIO GENERAL (BLOQUEO DE MUTACIONES ADMINISTRATIVAS Y OPERATIVAS)
  describe('Rol Usuario: Bloqueo de mutaciones de catálogo y operativas', () => {
    it('debe rechazar a un Usuario en POST /api/activos con 403', async () => {
      const res = await request(app)
        .post('/api/activos')
        .set('Authorization', `Bearer ${usuarioToken}`)
        .send({});

      expect(res.status).toBe(403);
    });

    it('debe rechazar a un Usuario en POST /api/prestamos con 403', async () => {
      const res = await request(app)
        .post('/api/prestamos')
        .set('Authorization', `Bearer ${usuarioToken}`)
        .send({});

      expect(res.status).toBe(403);
    });
  });
});
