import rateLimit from 'express-rate-limit';

/**
 * Rate Limiting para endpoint de inicio de sesión (/api/auth/login)
 * Limita a un máximo de 10 peticiones por ventana de 15 minutos por IP.
 * En entorno de pruebas (NODE_ENV === 'test'), no bloquea para permitir la ejecución de tests.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: process.env.NODE_ENV === 'test' ? 1000 : 10, // 10 peticiones por IP
  standardHeaders: true, // Devuelve info del rate limit en encabezados `RateLimit-*`
  legacyHeaders: false, // Deshabilita los encabezados `X-RateLimit-*`
  statusCode: 429,
  message: {
    success: false,
    message: 'Demasiados intentos de inicio de sesión desde esta IP. Por favor intenta de nuevo en 15 minutos.',
    error: 'Demasiados intentos de inicio de sesión. Por favor espera 15 minutos antes de volver a intentar.'
  },
  skip: (req) => process.env.NODE_ENV === 'test' && req.headers['x-skip-rate-limit'] === 'true'
});

export default loginLimiter;
