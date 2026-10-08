import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import inventoryRoutes from './routes/inventory.routes.js';
import apiRoutes from './routes/api.routes.js';

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Rutas directas para el frontend (/api/activos, /api/consumibles, /api/prestamos)
app.use('/api', apiRoutes);

// Rutas previas de inventario (/api/inventory)
app.use('/api/inventory', inventoryRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
