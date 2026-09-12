const { pool } = require('../config/db');

// Catalogo global (sin empresa_id) -- ver antecedentesPatologicos.routes.js
// para el gateo de permisos (lectura: cualquier usuario logueado;
// escritura: solo super admin).

async function listar(req, res, next) {
  try {
    const { categoria_id } = req.query;
    const params = [];
    let where = '';
    if (categoria_id) {
      params.push(categoria_id);
      where = 'where ap.categoria_id = $1';
    }
    const { rows } = await pool.query(
      `select ap.*, c.nombre as categoria_nombre
       from antecedentes_patologicos ap
       join categorias_antecedentes c on c.id = ap.categoria_id
       ${where}
       order by c.nombre asc, ap.nombre asc`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function crear(req, res, next) {
  try {
    const { categoria_id, nombre, orden, activo } = req.body;
    if (!categoria_id || !nombre) return res.status(400).json({ mensaje: 'categoria_id y nombre son requeridos' });
    const { rows } = await pool.query(
      `insert into antecedentes_patologicos (categoria_id, nombre, orden, activo)
       values ($1,$2, coalesce($3, 0), coalesce($4, true)) returning *`,
      [categoria_id, nombre, orden, activo]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ mensaje: 'Ya existe ese antecedente en esta categoria.' });
    if (err.code === '23503') return res.status(400).json({ mensaje: 'La categoria indicada no existe.' });
    next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const { categoria_id, nombre, orden, activo } = req.body;
    const { rows } = await pool.query(
      `update antecedentes_patologicos set
         categoria_id = coalesce($1, categoria_id),
         nombre = coalesce($2, nombre),
         orden = coalesce($3, orden),
         activo = coalesce($4, activo)
       where id = $5 returning *`,
      [categoria_id, nombre, orden, activo, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Antecedente no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ mensaje: 'Ya existe ese antecedente en esta categoria.' });
    if (err.code === '23503') return res.status(400).json({ mensaje: 'La categoria indicada no existe.' });
    next(err);
  }
}

async function eliminar(req, res, next) {
  try {
    const { rowCount } = await pool.query('delete from antecedentes_patologicos where id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ mensaje: 'Antecedente no encontrado' });
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { listar, crear, actualizar, eliminar };
