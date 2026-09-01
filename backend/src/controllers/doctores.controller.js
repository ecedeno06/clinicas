const { pool } = require('../config/db');

async function listar(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select d.*, e.nombre as especialidad_nombre
       from doctores d
       join especialidades e on e.id = d.especialidad_id
       where d.empresa_id = $1
       order by d.nombre asc`,
      [req.empresaId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function obtener(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select d.*, e.nombre as especialidad_nombre
       from doctores d
       join especialidades e on e.id = d.especialidad_id
       where d.id = $1 and d.empresa_id = $2`,
      [req.params.id, req.empresaId]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Doctor no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function crear(req, res, next) {
  try {
    const { nombre, especialidad_id, numero_colegiado, telefono, email, activo } = req.body;

    const especialidad = await pool.query('select id from especialidades where id = $1 and empresa_id = $2', [especialidad_id, req.empresaId]);
    if (!especialidad.rows[0]) return res.status(400).json({ mensaje: 'La especialidad indicada no pertenece a esta clinica' });

    const { rows } = await pool.query(
      `insert into doctores (empresa_id, especialidad_id, nombre, numero_colegiado, telefono, email, activo)
       values ($1,$2,$3,$4,$5,$6, coalesce($7, true)) returning *`,
      [req.empresaId, especialidad_id, nombre, numero_colegiado, telefono, email, activo]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function actualizar(req, res, next) {
  try {
    const { nombre, especialidad_id, numero_colegiado, telefono, email, activo } = req.body;

    if (especialidad_id) {
      const especialidad = await pool.query('select id from especialidades where id = $1 and empresa_id = $2', [especialidad_id, req.empresaId]);
      if (!especialidad.rows[0]) return res.status(400).json({ mensaje: 'La especialidad indicada no pertenece a esta clinica' });
    }

    const { rows } = await pool.query(
      `update doctores set
         nombre = coalesce($1, nombre),
         especialidad_id = coalesce($2, especialidad_id),
         numero_colegiado = coalesce($3, numero_colegiado),
         telefono = coalesce($4, telefono),
         email = coalesce($5, email),
         activo = coalesce($6, activo)
       where id = $7 and empresa_id = $8 returning *`,
      [nombre, especialidad_id, numero_colegiado, telefono, email, activo, req.params.id, req.empresaId]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Doctor no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function eliminar(req, res, next) {
  try {
    const { rowCount } = await pool.query(
      'delete from doctores where id = $1 and empresa_id = $2',
      [req.params.id, req.empresaId]
    );
    if (!rowCount) return res.status(404).json({ mensaje: 'Doctor no encontrado' });
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { listar, obtener, crear, actualizar, eliminar };
