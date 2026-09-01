const { pool } = require('../config/db');

async function listar(req, res, next) {
  try {
    const { rows } = await pool.query(
      'select * from pacientes where empresa_id = $1 order by nombre asc',
      [req.empresaId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function obtener(req, res, next) {
  try {
    const { rows } = await pool.query(
      'select * from pacientes where id = $1 and empresa_id = $2',
      [req.params.id, req.empresaId]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Paciente no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function crear(req, res, next) {
  try {
    const {
      nombre, identificacion, fecha_nacimiento, sexo, telefono, email,
      direccion, contacto_emergencia, alergias, activo,
    } = req.body;
    const { rows } = await pool.query(
      `insert into pacientes
         (empresa_id, nombre, identificacion, fecha_nacimiento, sexo, telefono, email, direccion, contacto_emergencia, alergias, activo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, coalesce($11, true)) returning *`,
      [
        req.empresaId, nombre, identificacion, fecha_nacimiento || null, sexo, telefono, email,
        direccion, contacto_emergencia ? JSON.stringify(contacto_emergencia) : null, alergias, activo,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function actualizar(req, res, next) {
  try {
    const {
      nombre, identificacion, fecha_nacimiento, sexo, telefono, email,
      direccion, contacto_emergencia, alergias, activo,
    } = req.body;
    const { rows } = await pool.query(
      `update pacientes set
         nombre = coalesce($1, nombre),
         identificacion = coalesce($2, identificacion),
         fecha_nacimiento = coalesce($3, fecha_nacimiento),
         sexo = coalesce($4, sexo),
         telefono = coalesce($5, telefono),
         email = coalesce($6, email),
         direccion = coalesce($7, direccion),
         contacto_emergencia = coalesce($8, contacto_emergencia),
         alergias = coalesce($9, alergias),
         activo = coalesce($10, activo)
       where id = $11 and empresa_id = $12 returning *`,
      [
        nombre, identificacion, fecha_nacimiento || null, sexo, telefono, email,
        direccion, contacto_emergencia ? JSON.stringify(contacto_emergencia) : null, alergias, activo,
        req.params.id, req.empresaId,
      ]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Paciente no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function eliminar(req, res, next) {
  try {
    const { rowCount } = await pool.query(
      'delete from pacientes where id = $1 and empresa_id = $2',
      [req.params.id, req.empresaId]
    );
    if (!rowCount) return res.status(404).json({ mensaje: 'Paciente no encontrado' });
    res.status(204).send();
  } catch (err) { next(err); }
}

// GET /api/pacientes/:id/historial  -> historias clinicas del paciente
async function historial(req, res, next) {
  try {
    const paciente = await pool.query('select id from pacientes where id = $1 and empresa_id = $2', [req.params.id, req.empresaId]);
    if (!paciente.rows[0]) return res.status(404).json({ mensaje: 'Paciente no encontrado' });

    const { rows } = await pool.query(
      `select hc.*, c.fecha as fecha_cita, d.nombre as doctor_nombre, e.nombre as especialidad_nombre
       from historias_clinicas hc
       join citas c on c.id = hc.cita_id
       join doctores d on d.id = hc.doctor_id
       join especialidades e on e.id = d.especialidad_id
       where hc.paciente_id = $1 and hc.empresa_id = $2
       order by c.fecha desc, c.hora_inicio desc`,
      [req.params.id, req.empresaId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { listar, obtener, crear, actualizar, eliminar, historial };
