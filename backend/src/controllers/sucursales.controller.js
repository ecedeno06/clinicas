const { pool } = require('../config/db');

// GET /api/sucursales
async function listar(req, res, next) {
  try {
    const { rows } = await pool.query(
      'select * from sucursales where empresa_id = $1 order by nombre asc',
      [req.empresaId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function obtener(req, res, next) {
  try {
    const { rows } = await pool.query(
      'select * from sucursales where id = $1 and empresa_id = $2',
      [req.params.id, req.empresaId]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Sucursal no encontrada' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

// POST /api/sucursales
async function crear(req, res, next) {
  try {
    const { nombre, direccion, telefono, google_maps_url, zona_horaria, hora_apertura, hora_cierre, activo } = req.body;
    if (!nombre) return res.status(400).json({ mensaje: 'nombre es requerido' });

    const { rows } = await pool.query(
      `insert into sucursales (empresa_id, nombre, direccion, telefono, google_maps_url, zona_horaria, hora_apertura, hora_cierre, activo)
       values ($1,$2,$3,$4,$5, coalesce($6, 'America/Panama'), $7,$8, coalesce($9, true)) returning *`,
      [req.empresaId, nombre, direccion, telefono, google_maps_url, zona_horaria, hora_apertura || null, hora_cierre || null, activo]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

// PUT /api/sucursales/:id
// Nota: no hay un DELETE -- una sucursal referenciada por doctor_horarios/citas
// no se puede borrar sin dejar huerfanos (ver DISENO-ZONA-HORARIA-SUCURSALES.md).
// "Eliminar" desde la UI en realidad desactiva (activo = false).
async function actualizar(req, res, next) {
  try {
    const { nombre, direccion, telefono, google_maps_url, zona_horaria, hora_apertura, hora_cierre, activo } = req.body;

    if (activo === false) {
      const otras = await pool.query(
        'select count(*)::int as n from sucursales where empresa_id = $1 and activo = true and id <> $2',
        [req.empresaId, req.params.id]
      );
      if (otras.rows[0].n === 0) {
        return res.status(400).json({ mensaje: 'No se puede desactivar la unica sucursal activa de la clinica.' });
      }
    }

    const { rows } = await pool.query(
      `update sucursales set
         nombre = coalesce($1, nombre),
         direccion = coalesce($2, direccion),
         telefono = coalesce($3, telefono),
         google_maps_url = coalesce($4, google_maps_url),
         zona_horaria = coalesce($5, zona_horaria),
         hora_apertura = $6,
         hora_cierre = $7,
         activo = coalesce($8, activo)
       where id = $9 and empresa_id = $10 returning *`,
      [nombre, direccion, telefono, google_maps_url, zona_horaria, hora_apertura || null, hora_cierre || null, activo, req.params.id, req.empresaId]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Sucursal no encontrada' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

module.exports = { listar, obtener, crear, actualizar };
