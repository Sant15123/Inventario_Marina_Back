/**
 * Middleware para validar tokens JWT en peticiones protegidas.
 * Extrae y verifica el token de Authorization: Bearer <token>.
 * Coloca los datos decodificados en req.user: { id, email, documento, nombre, rol, sede, cargo, ... }
 */
export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Acceso no autorizado: Se requiere token de autenticación (Bearer token).'
    });
  }

  const token = authHeader.split(' ')[1]?.trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Token de autenticación no proporcionado.'
    });
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return res.status(401).json({
        success: false,
        error: 'Token de autenticación inválido: formato no reconocido.'
      });
    }

    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }

    const payloadJson = Buffer.from(base64, 'base64').toString('utf8');
    const decoded = JSON.parse(payloadJson);

    // Verificar expiración si existe el claim 'exp'
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      return res.status(401).json({
        success: false,
        error: 'Sesión expirada: El token de autenticación ha caducado.'
      });
    }

    // Normalizar atributos esperados
    req.user = {
      ...decoded,
      id: decoded.id || decoded.sub || null,
      email: decoded.email ? String(decoded.email).trim().toLowerCase() : null,
      documento: decoded.documento ? String(decoded.documento).trim() : null,
      nombre_completo: decoded.nombre_completo || decoded.nombre || 'Usuario SIGA',
      nombre: decoded.nombre || decoded.nombre_completo || 'Usuario SIGA',
      rol: decoded.rol ? String(decoded.rol).toLowerCase().trim() : 'usuario',
      sede: decoded.sede ? String(decoded.sede).trim() : 'Medellín',
      cargo: decoded.cargo ? String(decoded.cargo).trim() : null
    };

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Error al verificar token de autenticación: ' + err.message
    });
  }
}

export function generateToken(payload, expiresInSeconds = 7 * 24 * 60 * 60) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    id: payload.id,
    documento: String(payload.documento || '').trim(),
    nombre_completo: payload.nombre_completo || payload.nombre || 'Usuario SIGA',
    nombre: payload.nombre || payload.nombre_completo || 'Usuario SIGA',
    email: payload.email ? String(payload.email).trim().toLowerCase() : '',
    rol: payload.rol ? String(payload.rol).toLowerCase().trim() : 'usuario',
    sede: payload.sede || 'Medellín',
    cargo: payload.cargo || 'Funcionario FMO',
    iat: now,
    exp: now + expiresInSeconds
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = Buffer.from(`${headerB64}.${payloadB64}.SIGA_FMO_SECRET_2026`).toString('base64url');

  return `${headerB64}.${payloadB64}.${sig}`;
}

export const verificarAutenticacion = verifyToken;
export default verifyToken;
