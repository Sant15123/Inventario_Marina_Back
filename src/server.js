import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { initDb } from './db.js';

const PORT = process.env.PORT || 3000;

// Inicializar tablas de PostgreSQL al arrancar el servidor
initDb().catch((err) => {
  console.warn('Advertencia al inicializar base de datos:', err.message);
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo exitosamente en http://localhost:${PORT}`);
  console.log(`📡 Endpoints montados:`);
  console.log(`   - GET  /api/activos`);
  console.log(`   - GET  /api/consumibles`);
  console.log(`   - GET  /api/prestamos`);
  console.log(`   - POST /api/prestamos`);
  console.log(`   - PUT  /api/prestamos/:id/devolver`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Error: El puerto ${PORT} ya está en uso por otro proceso.`);
  } else {
    console.error('❌ Error en el servidor Express:', error);
  }
});

const gracefulShutdown = () => {
  server.close(() => {
    console.log('Servidor detenido.');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export default app;