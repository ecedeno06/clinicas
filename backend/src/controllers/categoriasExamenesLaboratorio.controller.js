const { pool } = require('../config/db');

// Catalogo global (sin empresa_id) -- ver examenesLaboratorioCatalogo.controller.js
// y categoriasExamenesLaboratorio.routes.js para el gateo de permisos
// (lectura: cualquier usuario logueado; escritura: solo super admin).

async function listar(req, res, next) {
  try {
    const { rows } = await pool.query('select * from categorias_examenes_laboratorio order by nombre asc');
    res.json(rows);
  } catch (err) { next(err); }
}

async function crear(req, res, next) {
  try {
    const { nombre, orden, activo } = req.body;
    if (!nombre) return res.status(400).json({ mensaje: 'nombre es requerido' });
    const { rows } = await pool.query(
      `insert into categorias_examenes_laboratorio (nombre, orden, activo)
       values ($1, coalesce($2, 0), coalesce($3, true)) returning *`,
      [nombre, orden, activo]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ mensaje: 'Ya existe una categoria con ese nombre.' });
    next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const { nombre, orden, activo } = req.body;
    const { rows } = await pool.query(
      `update categorias_examenes_laboratorio set
         nombre = coalesce($1, nombre),
         orden = coalesce($2, orden),
         activo = coalesce($3, activo)
       where id = $4 returning *`,
      [nombre, orden, activo, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Categoria no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ mensaje: 'Ya existe una categoria con ese nombre.' });
    next(err);
  }
}

async function eliminar(req, res, next) {
  try {
    const { rowCount } = await pool.query('delete from categorias_examenes_laboratorio where id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ mensaje: 'Categoria no encontrada' });
    res.status(204).send();
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ mensaje: 'No se puede eliminar: tiene examenes registrados en esta categoria.' });
    next(err);
  }
}

module.exports = { listar, crear, actualizar, eliminar };
