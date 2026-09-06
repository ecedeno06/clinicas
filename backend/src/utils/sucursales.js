const { pool } = require('../config/db');

// Resuelve la sucursal a usar cuando el llamador todavia no elige una
// explicitamente (caso normal mientras la clinica solo tenga una sede). Usa
// la sucursal mas antigua de la empresa -- misma regla que el backfill de
// la migracion 012, para que el comportamiento de hoy no cambie en nada.
async function obtenerSucursalPorDefecto(empresaId) {
  const { rows } = await pool.query(
    'select id from sucursales where empresa_id = $1 and activo = true order by created_at asc limit 1',
    [empresaId]
  );
  return rows[0]?.id || null;
}

// Confirma que la sucursal indicada pertenezca a la empresa activa (y este
// activa ella misma); si no se indico ninguna, cae en obtenerSucursalPorDefecto.
// Devuelve null si la sucursal indicada no es valida.
async function resolverSucursal(sucursalId, empresaId) {
  if (!sucursalId) return obtenerSucursalPorDefecto(empresaId);
  const { rows } = await pool.query(
    'select id from sucursales where id = $1 and empresa_id = $2 and activo = true',
    [sucursalId, empresaId]
  );
  return rows[0]?.id || null;
}

module.exports = { obtenerSucursalPorDefecto, resolverSucursal };
