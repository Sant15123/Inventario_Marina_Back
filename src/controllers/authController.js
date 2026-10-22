import bcrypt from 'bcrypt';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { pool } from '../db.js';
import { generateToken } from '../middleware/verifyToken.js';

/**
 * POST /api/auth/login
 * Autenticación mediante email o documento contra la tabla public.perfiles con contraseñas bcrypt
 */
export const login = async (req, res) => {
  try {
    const { identifier, email, documento, password } = req.body;
    const loginIdentifier = String(identifier || email || documento || '').trim().toLowerCase();
    const passwordIngresada = String(password || '').trim();

    if (!loginIdentifier || !passwordIngresada) {
      return res.status(400).json({
        success: false,
        message: 'Por favor ingresa tu correo/documento y contraseña.',
        error: 'Por favor ingresa tu correo/documento y contraseña.'
      });
    }

    // 1. Buscar al usuario en public.perfiles por email o documento
    const query = `
      SELECT id, documento, nombre_completo, telefono, email, rol, sede, cargo, activo, password
      FROM perfiles
      WHERE LOWER(email) = LOWER($1) OR LOWER(documento) = LOWER($1)
      LIMIT 1;
    `;
    const result = await pool.query(query, [loginIdentifier]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'No se encontró ningún usuario con ese correo o documento.',
        error: 'No se encontró ningún usuario con ese correo o documento.'
      });
    }

    const perfil = result.rows[0];

    if (perfil.activo === false) {
      return res.status(403).json({
        success: false,
        message: 'Este usuario se encuentra inactivo en el sistema.',
        error: 'Usuario inactivo.'
      });
    }

    // 2. Comparar la contraseña ingresada con el hash guardado usando bcrypt.compare
    let coincide = false;
    if (perfil.password) {
      try {
        coincide = await bcrypt.compare(passwordIngresada, perfil.password);
      } catch (err) {
        console.warn('Error al verificar hash bcrypt:', err.message);
      }
    }

    // Fallback con Supabase Auth si en la tabla perfiles aún no tenía hash
    if (!coincide && !perfil.password && perfil.email) {
      try {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: perfil.email,
          password: passwordIngresada
        });
        if (!signInError) {
          coincide = true;
          // Si autenticó con Supabase Auth, guardar el hash bcrypt de una vez
          const hashBcrypt = await bcrypt.hash(passwordIngresada, 10);
          await pool.query('UPDATE perfiles SET password = $1 WHERE id = $2', [hashBcrypt, perfil.id]);
        }
      } catch {
        // Continuar
      }
    }

    if (!coincide) {
      return res.status(401).json({
        success: false,
        message: 'La contraseña ingresada es incorrecta. Por favor intenta de nuevo.',
        error: 'La contraseña ingresada es incorrecta.'
      });
    }

    // 3. Emitir el token de sesión con sus datos y su rol real guardado en la base de datos
    const tokenPayload = {
      id: perfil.id,
      documento: perfil.documento,
      nombre: perfil.nombre_completo,
      nombre_completo: perfil.nombre_completo,
      email: perfil.email,
      rol: perfil.rol,
      sede: perfil.sede || 'Medellín',
      cargo: perfil.cargo || 'Funcionario FMO'
    };

    const token = generateToken(tokenPayload);

    return res.status(200).json({
      success: true,
      message: 'Inicio de sesión exitoso',
      token,
      usuario: tokenPayload
    });
  } catch (error) {
    console.error('Error en /api/auth/login:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor al procesar el inicio de sesión.',
      error: error.message
    });
  }
};

/**
 * PUT / POST /api/auth/cambiar-password
 * Actualización de contraseña con validación previa bcrypt y sincronización en perfiles y Supabase Auth
 */
export const cambiarPassword = async (req, res) => {
  try {
    const { password_actual, nueva_password } = req.body;
    const usuario = req.user; // Obtenido del token JWT o middleware de auth

    if (!password_actual || typeof password_actual !== 'string' || !password_actual.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Debes proporcionar la contraseña actual y la nueva contraseña.',
        error: 'La contraseña actual es obligatoria.'
      });
    }

    if (!nueva_password || typeof nueva_password !== 'string' || !nueva_password.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Debes proporcionar la contraseña actual y la nueva contraseña.',
        error: 'La nueva contraseña es obligatoria.'
      });
    }

    // Revalidar estándares de seguridad
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#._-])[A-Za-z\d@$!%*?&#._-]{8,}$/;
    if (!passwordRegex.test(nueva_password)) {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña no cumple con los requisitos de seguridad: debe tener mínimo 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial (@$!%*?&#._-).',
        error: 'La nueva contraseña no cumple con los requisitos de seguridad: debe tener mínimo 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial (@$!%*?&#._-).'
      });
    }

    // Comprobar que nueva_password no sea idéntica a password_actual
    if (nueva_password === password_actual) {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña no puede ser idéntica a la contraseña actual.',
        error: 'La nueva contraseña no puede ser idéntica a la contraseña actual.'
      });
    }

    // Obtener el perfil actual de la base de datos
    const userRes = await pool.query(
      'SELECT id, documento, email, password, nombre_completo, sede FROM perfiles WHERE id = $1 OR documento = $2',
      [usuario?.id, usuario?.documento || '']
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado en la base de datos.',
        error: 'Usuario no encontrado.'
      });
    }

    const perfil = userRes.rows[0];

    // NOTA: Proteger explícitamente a Santiago Suárez Duran (doc: 1038648135)
    if (String(perfil.documento).trim() === '1038648135') {
      return res.status(403).json({
        success: false,
        message: 'No está permitido modificar la clave institucional de Santiago Suárez Duran.',
        error: 'Operación restringida para este usuario.'
      });
    }

    // 1. Validar que await bcrypt.compare(password_actual, perfil.password) sea verdadero
    let passwordValida = false;
    if (perfil.password) {
      try {
        passwordValida = await bcrypt.compare(password_actual, perfil.password);
      } catch (err) {
        console.warn('Error al verificar password con bcrypt:', err.message);
      }
    }

    // Fallback: si no tenía hash en perfiles o falló, validar con Supabase Auth
    if (!passwordValida && perfil.email) {
      try {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: perfil.email,
          password: password_actual
        });
        if (!signInError) {
          passwordValida = true;
        }
      } catch {
        // Continuar
      }
    }

    if (!passwordValida) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña actual ingresada es incorrecta.',
        error: 'La contraseña actual ingresada es incorrecta.'
      });
    }

    // 2. Hashear nueva_password con bcrypt.hash(nueva_password, 10)
    const nuevoHash = await bcrypt.hash(nueva_password, 10);

    // 3. Actualizar en Supabase Auth si existe el usuario en Auth
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      perfil.id,
      { password: nueva_password }
    );

    if (updateError) {
      return res.status(500).json({
        success: false,
        message: 'Error al actualizar contraseña: ' + updateError.message,
        error: 'Error al actualizar la contraseña en Supabase: ' + updateError.message
      });
    }

    // 4. Ejecutar UPDATE en public.perfiles una vez confirmado
    await pool.query('UPDATE perfiles SET password = $1, updated_at = NOW() WHERE id = $2', [nuevoHash, perfil.id]);

    try {
      await supabase
        .from('perfiles')
        .update({ password: nuevoHash })
        .eq('id', perfil.id);
    } catch (e) {
      console.warn('Advertencia actualizando hash en supabase client:', e.message);
    }

    // 4. Registrar auditoría en historial_movimientos
    try {
      await pool.query(`
        INSERT INTO historial_movimientos (
          tipo, elemento_nombre, placa_o_id, cantidad, responsable, sede, fecha, detalles, usuario_id, documento_responsable
        )
        VALUES (
          'Actualización', 'Seguridad de Usuario', $1, 1, $2, $3, NOW(), 'Cambio de contraseña exitoso', $4, $5
        )
      `, [
        perfil.documento || perfil.id,
        perfil.nombre_completo || usuario?.nombre || perfil.email,
        perfil.sede || 'MEDELLÍN',
        perfil.id,
        perfil.documento || null
      ]);
    } catch (histError) {
      console.warn('No se pudo registrar en historial:', histError.message);
    }

    return res.status(200).json({
      success: true,
      message: '¡Contraseña actualizada exitosamente!',
      mensaje: 'Contraseña actualizada exitosamente'
    });
  } catch (error) {
    console.error('Error en /api/auth/cambiar-password:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor al procesar el cambio de contraseña.',
      error: error.message || 'Error interno del servidor al procesar el cambio de contraseña.'
    });
  }
};

export default {
  login,
  cambiarPassword
};
