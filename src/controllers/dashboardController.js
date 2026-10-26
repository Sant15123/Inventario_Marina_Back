import { pool } from '../db.js';
import { supabase } from '../config/supabase.js';

/**
 * Controlador de métricas ligeras para el Dashboard
 * Endpoint: GET /api/dashboard/kpis
 */
export const getDashboardKPIs = async (req, res) => {
  try {
    const { sede } = req.query;
    const filtroSede = sede && typeof sede === 'string' && sede.trim() && sede.toLowerCase() !== 'todas' && sede.toLowerCase() !== 'todos'
      ? sede.trim()
      : null;

    // 1. Intento vía RPC de Supabase (si está configurada y disponible)
    try {
      if (supabase?.rpc) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('obtener_kpis_dashboard', filtroSede ? { p_sede: filtroSede } : {});
        if (!rpcError && rpcData && typeof rpcData === 'object') {
          const totalMateriales = Number(rpcData.totalMateriales ?? rpcData.totalItems ?? rpcData.total_materiales ?? 0);
          const criticosStock = Number(rpcData.criticosStock ?? rpcData.stockCritico ?? rpcData.criticos_stock ?? 0);
          const prestamosActivos = Number(rpcData.prestamosActivos ?? rpcData.prestamos_activos ?? 0);
          const prestamosVencidos = Number(rpcData.prestamosVencidos ?? rpcData.prestamos_vencidos ?? 0);

          return res.status(200).json({
            success: true,
            data: {
              totalMateriales,
              totalItems: totalMateriales,
              criticosStock,
              stockCritico: criticosStock,
              prestamosActivos,
              prestamosVencidos
            }
          });
        }
      }
    } catch (sbErr) {
      // Supabase RPC no disponible o sin credenciales, proceder al fallback relacional
    }

    // 2. Intento invocando la función PostgreSQL directamente en el pool
    if (!filtroSede) {
      try {
        const rpcPgRes = await pool.query('SELECT obtener_kpis_dashboard() as kpis');
        if (rpcPgRes.rows.length > 0 && rpcPgRes.rows[0].kpis) {
          const k = rpcPgRes.rows[0].kpis;
          const totalMateriales = Number(k.totalMateriales ?? k.totalItems ?? k.total_materiales ?? 0);
          const criticosStock = Number(k.criticosStock ?? k.stockCritico ?? k.criticos_stock ?? 0);
          const prestamosActivos = Number(k.prestamosActivos ?? k.prestamos_activos ?? 0);
          const prestamosVencidos = Number(k.prestamosVencidos ?? k.prestamos_vencidos ?? 0);

          return res.status(200).json({
            success: true,
            data: {
              totalMateriales,
              totalItems: totalMateriales,
              criticosStock,
              stockCritico: criticosStock,
              prestamosActivos,
              prestamosVencidos
            }
          });
        }
      } catch {
        // Proceder a consultas agregadas directas
      }
    }

    // 3. Fallback directo: Consultas agregadas consolidadas en PostgreSQL
    const aggregatedQuery = `
      SELECT
        (
          SELECT COUNT(*) 
          FROM activos 
          WHERE ($1::text IS NULL OR LOWER(sede) = LOWER($1))
        ) as total_activos,
        (
          SELECT COUNT(*) 
          FROM consumibles 
          WHERE ($1::text IS NULL OR LOWER(ubicacion) ILIKE '%' || LOWER($1) || '%')
        ) as total_consumibles,
        (
          (
            SELECT COUNT(*) 
            FROM consumibles 
            WHERE disponible <= COALESCE(minimo, 5) 
              AND ($1::text IS NULL OR LOWER(ubicacion) ILIKE '%' || LOWER($1) || '%')
          ) +
          (
            SELECT COUNT(*) 
            FROM activos 
            WHERE LOWER(estado) NOT IN ('disponible', 'bueno') 
              AND ($1::text IS NULL OR LOWER(sede) = LOWER($1))
          )
        ) as criticos_stock,
        (
          SELECT COUNT(*) 
          FROM prestamos 
          WHERE LOWER(estado) = 'activo' 
            AND ($1::text IS NULL OR LOWER(sede) = LOWER($1))
        ) as prestamos_activos,
        (
          SELECT COUNT(*) 
          FROM prestamos 
          WHERE LOWER(estado) = 'activo' 
            AND fecha_devolucion_esperada IS NOT NULL 
            AND fecha_devolucion_esperada < CURRENT_DATE
            AND ($1::text IS NULL OR LOWER(sede) = LOWER($1))
        ) as prestamos_vencidos
    `;

    const aggRes = await pool.query(aggregatedQuery, [filtroSede]);
    const row = aggRes.rows[0] || {};

    const totalMateriales = Number(row.total_activos) || 0;
    const criticosStock = Number(row.criticos_stock) || 0;
    const prestamosActivos = Number(row.prestamos_activos) || 0;
    const prestamosVencidos = Number(row.prestamos_vencidos) || 0;

    return res.status(200).json({
      success: true,
      data: {
        totalMateriales,
        totalItems: totalMateriales,
        criticosStock,
        stockCritico: criticosStock,
        prestamosActivos,
        prestamosVencidos
      }
    });

  } catch (error) {
    console.error('Error al obtener KPIs del dashboard:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Error al consolidar métricas del dashboard: ' + error.message,
      data: {
        totalMateriales: 0,
        totalItems: 0,
        criticosStock: 0,
        stockCritico: 0,
        prestamosActivos: 0,
        prestamosVencidos: 0
      }
    });
  }
};
