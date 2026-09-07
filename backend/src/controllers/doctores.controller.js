const { pool } = require('../config/db');

// Un doctor puede tener varias especialidades (tabla puente
// doctor_especialidades), cada una con su propio numero de colegiado.
// especialidad_nombre viaja tambien como string ya unido ("Cardiologia,
// Pediatria") para las pantallas que solo muestran texto (receta,
// WhatsApp, listados) sin necesitar el arreglo estructurado.
const SELECT_DOCTOR = `
  select
    d.*,
    coalesce((
      select json_agg(json_build_object('especialidad_id', e.id, 'nombre', e.nombre, 'numero_colegiado', de.numero_colegiado) order by e.nombre)
      from doctor_especialidades de
      join especialidades e on e.id = de.especialidad_id
      where de.doctor_id = d.id
    ), '[]') as especialidades,
    (
      select string_agg(e.nombre, ', ' order by e.nombre)
      from doctor_especialidades de
      join especialidades e on e.id = de.especialidad_id
      where de.doctor_id = d.id
    ) as especialidad_nombre
  from doctores d
`;

async function obtenerDoctorConEspecialidades(id, empresaId) {
  const { rows } = await pool.query(`${SELECT_DOCTOR} where d.id = $1 and d.empresa_id = $2`, [id, empresaId]);
  return rows[0] || null;
}

// Valida que el arreglo de especialidades sea correcto: no vacio, sin
// repetidos, y todas pertenecientes a la clinica. Devuelve un mensaje de
// error (string) o null si esta todo bien.
async function validarEspecialidades(especialidades, empresaId) {
  if (!Array.isArray(especialidades) || especialidades.length === 0) {
    return 'Debe indicar al menos una especialidad';
  }
  const ids = especialidades.map((e) => e.especialidad_id);
  if (new Set(ids).size !== ids.length) {
    return 'No se puede repetir una especialidad';
  }
  const { rows } = await pool.query('select id from especialidades where id = any($1::uuid[]) and empresa_id = $2', [ids, empresaId]);
  if (rows.length !== ids.length) {
    return 'Alguna especialidad indicada no pertenece a esta clinica';
  }
  return null;
}

async function reemplazarEspecialidades(doctorId, especialidades) {
  await pool.query('delete from doctor_especialidades where doctor_id = $1', [doctorId]);
  for (const e of especialidades) {
    await pool.query(
      'insert into doctor_especialidades (doctor_id, especialidad_id, numero_colegiado) values ($1,$2,$3)',
      [doctorId, e.especialidad_id, e.numero_colegiado || null]
    );
  }
}

async function listar(req, res, next) {
  try {
    const { rows } = await pool.query(`${SELECT_DOCTOR} where d.empresa_id = $1 order by d.nombre asc`, [req.empresaId]);
    res.json(rows);
  } catch (err) { next(err); }
}

async function obtener(req, res, next) {
  try {
    const doctor = await obtenerDoctorConEspecialidades(req.params.id, req.empresaId);
    if (!doctor) return res.status(404).json({ mensaje: 'Doctor no encontrado' });
    res.json(doctor);
  } catch (err) { next(err); }
}

async function crear(req, res, next) {
  try {
    const { nombre, especialidades, telefono, acepta_whatsapp, email, activo } = req.body;

    const errorEspecialidades = await validarEspecialidades(especialidades, req.empresaId);
    if (errorEspecialidades) return res.status(400).json({ mensaje: errorEspecialidades });

    const { rows } = await pool.query(
      `insert into doctores (empresa_id, nombre, telefono, acepta_whatsapp, email, activo)
       values ($1,$2,$3, coalesce($4, false),$5, coalesce($6, true)) returning id`,
      [req.empresaId, nombre, telefono, acepta_whatsapp, email, activo]
    );
    const doctorId = rows[0].id;
    await reemplazarEspecialidades(doctorId, especialidades);

    const doctor = await obtenerDoctorConEspecialidades(doctorId, req.empresaId);
    res.status(201).json(doctor);
  } catch (err) { next(err); }
}

async function actualizar(req, res, next) {
  try {
    const { nombre, especialidades, telefono, acepta_whatsapp, email, activo } = req.body;

    if (especialidades !== undefined) {
      const errorEspecialidades = await validarEspecialidades(especialidades, req.empresaId);
      if (errorEspecialidades) return res.status(400).json({ mensaje: errorEspecialidades });
    }

    const { rows } = await pool.query(
      `update doctores set
         nombre = coalesce($1, nombre),
         telefono = coalesce($2, telefono),
         acepta_whatsapp = coalesce($3, acepta_whatsapp),
         email = coalesce($4, email),
         activo = coalesce($5, activo)
       where id = $6 and empresa_id = $7 returning id`,
      [nombre, telefono, acepta_whatsapp, email, activo, req.params.id, req.empresaId]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Doctor no encontrado' });

    if (especialidades !== undefined) await reemplazarEspecialidades(req.params.id, especialidades);

    const doctor = await obtenerDoctorConEspecialidades(req.params.id, req.empresaId);
    res.json(doctor);
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
