const { pool } = require('../config/db');

// GET /api/citas?doctor_id=&paciente_id=&estado=&desde=&hasta=
async function listar(req, res, next) {
  try {
    const { doctor_id, paciente_id, estado, desde, hasta } = req.query;
    const condiciones = ['c.empresa_id = $1'];
    const valores = [req.empresaId];

    if (doctor_id) { valores.push(doctor_id); condiciones.push(`c.doctor_id = $${valores.length}`); }
    if (paciente_id) { valores.push(paciente_id); condiciones.push(`c.paciente_id = $${valores.length}`); }
    if (estado) { valores.push(estado); condiciones.push(`c.estado = $${valores.length}`); }
    if (desde) { valores.push(desde); condiciones.push(`c.fecha >= $${valores.length}`); }
    if (hasta) { valores.push(hasta); condiciones.push(`c.fecha <= $${valores.length}`); }

    const where = `where ${condiciones.join(' and ')}`;

    const { rows } = await pool.query(
      `select c.*, p.nombre as paciente_nombre, d.nombre as doctor_nombre, e.nombre as especialidad_nombre,
              (hc.id is not null) as tiene_historia,
              (sv.id is not null) as tiene_signos_vitales,
              exists(select 1 from recetas r where r.cita_id = c.id) as tiene_receta,
              exists(select 1 from ordenes_laboratorio ol where ol.cita_id = c.id) as tiene_laboratorio,
              (case when p.fecha_nacimiento is not null then date_part('year', age(c.fecha, p.fecha_nacimiento))::int end) as paciente_edad
       from citas c
       join pacientes p on p.id = c.paciente_id
       join doctores d on d.id = c.doctor_id
       join especialidades e on e.id = d.especialidad_id
       left join historias_clinicas hc on hc.cita_id = c.id
       left join signos_vitales sv on sv.cita_id = c.id
       ${where}
       order by c.fecha desc, c.hora_inicio desc`,
      valores
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function obtener(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select c.*, p.nombre as paciente_nombre, d.nombre as doctor_nombre, e.nombre as especialidad_nombre
       from citas c
       join pacientes p on p.id = c.paciente_id
       join doctores d on d.id = c.doctor_id
       join especialidades e on e.id = d.especialidad_id
       where c.id = $1 and c.empresa_id = $2`,
      [req.params.id, req.empresaId]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Cita no encontrada' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

// Confirma que el doctor no tenga otra cita (no cancelada) que se cruce
// con el horario indicado, en esa misma fecha. excluirCitaId se usa al
// editar una cita para no chocar contra si misma.
async function hayChoqueDeHorario({ empresaId, doctorId, fecha, horaInicio, horaFin, excluirCitaId }) {
  const valores = [doctorId, fecha, horaInicio, horaFin, empresaId];
  let exclusion = '';
  if (excluirCitaId) {
    valores.push(excluirCitaId);
    exclusion = `and id <> $${valores.length}`;
  }
  const { rows } = await pool.query(
    `select 1 from citas
     where doctor_id = $1 and fecha = $2 and empresa_id = $5
       and estado <> 'cancelada'
       and hora_inicio < $4 and hora_fin > $3
       ${exclusion}
     limit 1`,
    valores
  );
  return !!rows[0];
}

// POST /api/citas
async function crear(req, res, next) {
  try {
    const { paciente_id, doctor_id, fecha, hora_inicio, hora_fin, motivo, observaciones, estado } = req.body;

    if (!paciente_id || !doctor_id || !fecha || !hora_inicio || !hora_fin) {
      return res.status(400).json({ mensaje: 'paciente, doctor, fecha y horario son requeridos' });
    }
    if (hora_fin <= hora_inicio) {
      return res.status(400).json({ mensaje: 'La hora de fin debe ser posterior a la hora de inicio.' });
    }

    const paciente = await pool.query('select 1 from pacientes_empresas where paciente_id = $1 and empresa_id = $2', [paciente_id, req.empresaId]);
    if (!paciente.rows[0]) return res.status(400).json({ mensaje: 'El paciente indicado no pertenece a esta clinica' });

    const doctor = await pool.query('select id from doctores where id = $1 and empresa_id = $2', [doctor_id, req.empresaId]);
    if (!doctor.rows[0]) return res.status(400).json({ mensaje: 'El doctor indicado no pertenece a esta clinica' });

    const choque = await hayChoqueDeHorario({ empresaId: req.empresaId, doctorId: doctor_id, fecha, horaInicio: hora_inicio, horaFin: hora_fin });
    if (choque) {
      return res.status(409).json({ mensaje: 'El doctor ya tiene una cita agendada que se cruza con ese horario.' });
    }

    const { rows } = await pool.query(
      `insert into citas (empresa_id, paciente_id, doctor_id, fecha, hora_inicio, hora_fin, motivo, observaciones, estado)
       values ($1,$2,$3,$4,$5,$6,$7,$8, coalesce($9, 'pendiente')) returning *`,
      [req.empresaId, paciente_id, doctor_id, fecha, hora_inicio, hora_fin, motivo, observaciones, estado]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

// PUT /api/citas/:id
async function actualizar(req, res, next) {
  try {
    const { fecha, hora_inicio, hora_fin, estado, motivo, observaciones } = req.body;

    const actual = await pool.query('select * from citas where id = $1 and empresa_id = $2', [req.params.id, req.empresaId]);
    if (!actual.rows[0]) return res.status(404).json({ mensaje: 'Cita no encontrada' });
    const cita = actual.rows[0];

    const nuevaFecha = fecha || cita.fecha;
    const nuevaHoraInicio = hora_inicio || cita.hora_inicio;
    const nuevaHoraFin = hora_fin || cita.hora_fin;
    if (nuevaHoraFin <= nuevaHoraInicio) {
      return res.status(400).json({ mensaje: 'La hora de fin debe ser posterior a la hora de inicio.' });
    }

    if (fecha || hora_inicio || hora_fin) {
      const choque = await hayChoqueDeHorario({
        empresaId: req.empresaId, doctorId: cita.doctor_id, fecha: nuevaFecha,
        horaInicio: nuevaHoraInicio, horaFin: nuevaHoraFin, excluirCitaId: cita.id,
      });
      if (choque) {
        return res.status(409).json({ mensaje: 'El doctor ya tiene una cita agendada que se cruza con ese horario.' });
      }
    }

    const { rows } = await pool.query(
      `update citas set
         fecha = coalesce($1, fecha),
         hora_inicio = coalesce($2, hora_inicio),
         hora_fin = coalesce($3, hora_fin),
         estado = coalesce($4, estado),
         motivo = coalesce($5, motivo),
         observaciones = coalesce($6, observaciones)
       where id = $7 and empresa_id = $8 returning *`,
      [fecha, hora_inicio, hora_fin, estado, motivo, observaciones, req.params.id, req.empresaId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function eliminar(req, res, next) {
  try {
    const { rowCount } = await pool.query(
      'delete from citas where id = $1 and empresa_id = $2',
      [req.params.id, req.empresaId]
    );
    if (!rowCount) return res.status(404).json({ mensaje: 'Cita no encontrada' });
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { listar, obtener, crear, actualizar, eliminar };
