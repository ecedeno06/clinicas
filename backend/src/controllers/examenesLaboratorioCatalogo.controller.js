const { pool } = require('../config/db');

// Catalogo global (sin empresa_id) -- ver examenesLaboratorioCatalogo.routes.js
// para el gateo de permisos (lectura: cualquier usuario logueado;
// escritura: solo super admin).

async function listar(req, res, next) {
  try {
    const { categoria_id } = req.query;
    const params = [];
    let where = '';
    if (categoria_id) {
      params.push(categoria_id);
      where = 'where e.categoria_id = $1';
    }
    const { rows } = await pool.query(
      `select e.*, c.nombre as categoria_nombre
       from examenes_laboratorio_catalogo e
       join categorias_examenes_laboratorio c on c.id = e.categoria_id
       ${where}
       order by c.orden asc, e.orden asc, e.nombre asc`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function crear(req, res, next) {
  try {
    const { categoria_id, nombre, valor_referencia, unidad, orden, activo } = req.body;
    if (!categoria_id || !nombre) return res.status(400).json({ mensaje: 'categoria_id y nombre son requeridos' });
    const { rows } = await pool.query(
      `insert into examenes_laboratorio_catalogo (categoria_id, nombre, valor_referencia, unidad, orden, activo)
       values ($1,$2,$3,$4, coalesce($5, 0), coalesce($6, true)) returning *`,
      [categoria_id, nombre, valor_referencia, unidad, orden, activo]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ mensaje: 'Ya existe ese examen en esta categoria.' });
    if (err.code === '23503') return res.status(400).json({ mensaje: 'La categoria indicada no existe.' });
    next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const { categoria_id, nombre, valor_referencia, unidad, orden, activo } = req.body;
    const { rows } = await pool.query(
      `update examenes_laboratorio_catalogo set
         categoria_id = coalesce($1, categoria_id),
         nombre = coalesce($2, nombre),
         valor_referencia = $3,
         unidad = $4,
         orden = coalesce($5, orden),
         activo = coalesce($6, activo)
       where id = $7 returning *`,
      [categoria_id, nombre, valor_referencia, unidad, orden, activo, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Examen no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ mensaje: 'Ya existe ese examen en esta categoria.' });
    if (err.code === '23503') return res.status(400).json({ mensaje: 'La categoria indicada no existe.' });
    next(err);
  }
}

async function eliminar(req, res, next) {
  try {
    const { rowCount } = await pool.query('delete from examenes_laboratorio_catalogo where id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ mensaje: 'Examen no encontrado' });
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { listar, crear, actualizar, eliminar };
