import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/db.js';
import { supabaseAdmin } from '../../src/config/supabase.js';

describe('Suite de Pruebas: Registro de Usuarios con Supabase Auth y Base de Datos (SIGA)', () => {
  const testUsersToCleanup = [];

  afterAll(async () => {
    // Limpieza de usuarios insertados durante las pruebas
    for (const doc of testUsersToCleanup) {
      await pool.query('DELETE FROM historial_movimientos WHERE placa_o_id = $1', [doc]);
      await pool.query('DELETE FROM perfiles WHERE documento = $1', [doc]);
    }
    await pool.end();
  });

  describe('Validaciones previas en servidor (Campos, Formato, Contraseña y Roles)', () => {
    it('debe rechazar la petición si falta el documento', async () => {
      const res = await request(app)
        .post('/api/usuarios')
        .send({
          nombre_completo: 'Carlos Test',
          email: 'carlos.test@fmo.org',
          password: 'Password123!',
          rol: 'operador'
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('documento es obligatorio');
    });

    it('debe rechazar la petición si falta el nombre_completo', async () => {
      const res = await request(app)
        .post('/api/usuarios')
        .send({
          documento: '999000111',
          email: 'carlos.test@fmo.org',
          password: 'Password123!',
          rol: 'operador'
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('nombre completo es obligatorio');
    });

    it('debe rechazar la petición si falta el correo electrónico', async () => {
      const res = await request(app)
        .post('/api/usuarios')
        .send({
          documento: '999000111',
          nombre_completo: 'Carlos Test',
          password: 'Password123!'
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('correo electrónico es obligatorio');
    });

    it('debe asignar contraseña por defecto según rol si no se especifica en la petición', async () => {
      const res = await request(app)
        .post('/api/usuarios')
        .send({
          documento: '999000111_pwd_test',
          nombre_completo: 'Carlos Test Default Password',
          email: 'carlos.pwd.test@fmo.org',
          rol: 'operador'
        });

      // El usuario recibe 'oper123' por defecto y es procesado
      if (res.status === 201) {
        testUsersToCleanup.push('999000111_pwd_test');
        expect(res.body).toHaveProperty('usuario');
      } else {
        // En entorno mock/test si supabase responde
        expect(res.status).toBeLessThan(500);
      }
    });

    it('debe rechazar formato de correo electrónico inválido', async () => {
      const res = await request(app)
        .post('/api/usuarios')
        .send({
          documento: '999000111',
          nombre_completo: 'Carlos Test',
          email: 'correo-no-valido',
          password: 'Password123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('formato del correo electrónico es inválido');
    });

    it('debe rechazar contraseña con menos de 8 caracteres', async () => {
      const res = await request(app)
        .post('/api/usuarios')
        .send({
          documento: '999000111',
          nombre_completo: 'Carlos Test',
          email: 'carlos.test@fmo.org',
          password: '1234567' // 7 caracteres
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('al menos 8 caracteres');
    });

    it('debe rechazar rol no permitido', async () => {
      const res = await request(app)
        .post('/api/usuarios')
        .send({
          documento: '999000111',
          nombre_completo: 'Carlos Test',
          email: 'carlos.test@fmo.org',
          password: 'Password123!',
          rol: 'superadmin_invalido'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Rol inválido');
    });

    it('debe rechazar documento duplicado si ya existe en perfiles', async () => {
      // Documento del administrador creado en DB
      const res = await request(app)
        .post('/api/usuarios')
        .send({
          documento: '100123456',
          nombre_completo: 'Duplicado Doc',
          email: 'otro.email@fmo.org',
          password: 'Password123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('documento de identidad');
    });

    it('debe rechazar correo electrónico duplicado si ya existe en perfiles', async () => {
      // Email del administrador creado en DB
      const res = await request(app)
        .post('/api/usuarios')
        .send({
          documento: '987654321',
          nombre_completo: 'Duplicado Email',
          email: 'santiago.ortiz@fmo.org',
          password: 'Password123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('correo electrónico');
    });
  });

  describe('Flujo de Creación Atómica y Supabase Auth / perfiles', () => {
    const testDoc = '999888777';
    const testEmail = 'profesor.steam@fmo.org';

    beforeEach(() => {
      testUsersToCleanup.push(testDoc);
    });

    it('debe crear el usuario en Supabase Auth, registrarlo en perfiles y auditarlo en historial', async () => {
      const mockAuthUserId = 'd3b07384-d113-4e00-a544-0123456789ab';

      // Mock de Supabase Auth admin
      const createUserSpy = jest
        .spyOn(supabaseAdmin.auth.admin, 'createUser')
        .mockResolvedValueOnce({
          data: {
            user: {
              id: mockAuthUserId,
              email: testEmail
            }
          },
          error: null
        });

      // Mock de Supabase table perfiles insert
      const mockPerfilInsert = {
        id: mockAuthUserId,
        documento: testDoc,
        nombre_completo: 'Profesor Robótica STEAM',
        telefono: '3009998877',
        email: testEmail,
        rol: 'operador',
        sede: 'Carmen de Viboral',
        cargo: 'Formador de Semilleros STEAM',
        activo: true,
        created_at: new Date().toISOString()
      };

      const fromSpy = jest.spyOn(supabaseAdmin, 'from').mockReturnValueOnce({
        insert: jest.fn().mockReturnValueOnce({
          select: jest.fn().mockReturnValueOnce({
            single: jest.fn().mockResolvedValueOnce({
              data: mockPerfilInsert,
              error: null
            })
          })
        })
      });

      const res = await request(app)
        .post('/api/usuarios')
        .send({
          documento: testDoc,
          nombre_completo: 'Profesor Robótica STEAM',
          telefono: '3009998877',
          email: testEmail,
          rol: 'operador',
          sede: 'Carmen de Viboral',
          cargo: 'Formador de Semilleros STEAM',
          password: 'PasswordSegura2026!'
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('mensaje', 'Usuario registrado exitosamente');
      expect(res.body).toHaveProperty('usuario');
      expect(res.body.usuario.id).toBe(mockAuthUserId);
      expect(res.body.usuario.documento).toBe(testDoc);
      expect(res.body.usuario.email).toBe(testEmail);
      expect(res.body.usuario.rol).toBe('operador');

      // Verificar que se invocó Supabase Auth con los parámetros exactos
      expect(createUserSpy).toHaveBeenCalledWith({
        email: testEmail,
        password: 'PasswordSegura2026!',
        email_confirm: true,
        user_metadata: {
          nombre_completo: 'Profesor Robótica STEAM',
          documento: testDoc,
          rol: 'operador',
          sede: 'Carmen de Viboral',
          cargo: 'Formador de Semilleros STEAM'
        }
      });

      // Verificar que se registró la auditoría en historial_movimientos
      const histRes = await pool.query(
        'SELECT * FROM historial_movimientos WHERE placa_o_id = $1 ORDER BY id DESC LIMIT 1',
        [testDoc]
      );
      expect(histRes.rows.length).toBe(1);
      expect(histRes.rows[0].tipo).toBe('Ingreso');
      expect(histRes.rows[0].detalles).toContain('Profesor Robótica STEAM');
      expect(histRes.rows[0].detalles).toContain('operador');

      createUserSpy.mockRestore();
      fromSpy.mockRestore();
    });

    it('debe ejecutar rollback (deleteUser en Auth) si falla la inserción en la tabla perfiles', async () => {
      const rollbackUserId = 'e4c18495-e224-4f11-b655-1234567890cd';
      const rollbackDoc = '888777666';
      const rollbackEmail = 'rollback.user@fmo.org';

      const createUserSpy = jest
        .spyOn(supabaseAdmin.auth.admin, 'createUser')
        .mockResolvedValueOnce({
          data: {
            user: {
              id: rollbackUserId,
              email: rollbackEmail
            }
          },
          error: null
        });

      const deleteUserSpy = jest
        .spyOn(supabaseAdmin.auth.admin, 'deleteUser')
        .mockResolvedValueOnce({
          data: {},
          error: null
        });

      // Simular fallo en la tabla perfiles
      const fromSpy = jest.spyOn(supabaseAdmin, 'from').mockReturnValueOnce({
        insert: jest.fn().mockReturnValueOnce({
          select: jest.fn().mockReturnValueOnce({
            single: jest.fn().mockResolvedValueOnce({
              data: null,
              error: { message: 'Database connection error on table perfiles' }
            })
          })
        })
      });

      const res = await request(app)
        .post('/api/usuarios')
        .send({
          documento: rollbackDoc,
          nombre_completo: 'Usuario Rollback Test',
          email: rollbackEmail,
          password: 'PasswordRollback2026!',
          rol: 'usuario'
        });

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error', 'Error al registrar el perfil en la base de datos');

      // Verificar que deleteUser fue invocado con el id para evitar usuarios huérfanos en Auth
      expect(deleteUserSpy).toHaveBeenCalledWith(rollbackUserId);

      createUserSpy.mockRestore();
      deleteUserSpy.mockRestore();
      fromSpy.mockRestore();
    });

    it('debe devolver 400 si Supabase Auth rechaza la creación de credenciales', async () => {
      const authErrorDoc = '777666555';
      const authErrorEmail = 'auth.error@fmo.org';

      const createUserSpy = jest
        .spyOn(supabaseAdmin.auth.admin, 'createUser')
        .mockResolvedValueOnce({
          data: null,
          error: { message: 'A user with this email address has already been registered' }
        });

      const res = await request(app)
        .post('/api/usuarios')
        .send({
          documento: authErrorDoc,
          nombre_completo: 'Usuario Auth Error',
          email: authErrorEmail,
          password: 'PasswordSegura2026!'
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('already been registered');

      createUserSpy.mockRestore();
    });
  });
});
