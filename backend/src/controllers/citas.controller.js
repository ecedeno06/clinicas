const { pool } = require('../config/db');
const { registrarEventosCita, primerEventoLog } = require('../utils/citaLog');
const { resolverSucursal } = require('../utils/sucursales');

// GET /api/citas?doctor_id=&paciente_id=&estado=&desde=&hasta=&sucursal_id=
async function listar(req, res, next) {
  try {
    const { doctor_id, paciente_id, estado, desde, hasta, sucursal_id } = req.query;
    const condiciones = ['c.empresa_id = $1'];
    const valores = [req.empresaId];

    if (doctor_id) { valores.push(doctor_id); condiciones.push(`c.doctor_id = $${valores.length}`); }
    if (paciente_id) { valores.push(paciente_id); condiciones.push(`c.paciente_id = $${valores.length}`); }
    if (estado) { valores.push(estado); condiciones.push(`c.estado = $${valores.length}`); }
    if (desde) { valores.push(desde); condiciones.push(`c.fecha >= $${valores.length}`); }
    if (hasta) { valores.push(hasta); condiciones.push(`c.fecha <= $${valores.length}`); }
    if (sucursal_id) { valores.push(sucursal_id); condiciones.push(`c.sucursal_id = $${valores.length}`); }

    const where = `where ${condiciones.join(' and ')}`;

    const { rows } = await pool.query(
      `select c.*, p.nombre as paciente_nombre, p.telefono as paciente_telefono, p.acepta_whatsapp as paciente_acepta_whatsapp,
              d.nombre as doctor_nombre, e.nombre as especialidad_nombre,
              s.nombre as sucursal_nombre, s.direccion as sucursal_direccion, s.google_maps_url as sucursal_google_maps_url,
              s.hora_apertura as sucursal_hora_apertura, s.hora_cierre as sucursal_hora_cierre,
              (hc.id is not null) as tiene_historia,
              (sv.id is not null) as tiene_signos_vitales,
              exists(select 1 from recetas r where r.cita_id = c.id) as tiene_receta,
              exists(select 1 from ordenes_laboratorio ol where ol.cita_id = c.id) as tiene_laboratorio,
              (case
                when exists(select 1 from ordenes_laboratorio ol where ol.cita_id = c.id and ol.estado = 'pendiente') then 'pendiente'
                when exists(select 1 from ordenes_laboratorio ol where ol.cita_id = c.id and ol.estado = 'completada') then 'completada'
                when exists(select 1 from ordenes_laboratorio ol where ol.cita_id = c.id and ol.estado = 'cancelada') then 'cancelada'
              end) as estado_laboratorio,
              (case when p.fecha_nacimiento is not null then date_part('year', age(c.fecha, p.fecha_nacimiento))::int end) as paciente_edad
       from citas c
       join pacientes p on p.id = c.paciente_id
       join doctores d on d.id = c.doctor_id
       join especialidades e on e.id = d.especialidad_id
       join sucursales s on s.id = c.sucursal_id
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
      `select c.*, p.nombre as paciente_nombre, p.telefono as paciente_telefono, p.acepta_whatsapp as paciente_acepta_whatsapp,
              d.nombre as doctor_nombre, e.nombre as especialidad_nombre,
              s.nombre as sucursal_nombre, s.direccion as sucursal_direccion, s.google_maps_url as sucursal_google_maps_url,
              s.hora_apertura as sucursal_hora_apertura, s.hora_cierre as sucursal_hora_cierre
       from citas c
       join pacientes p on p.id = c.paciente_id
       join doctores d on d.id = c.doctor_id
       join especialidades e on e.id = d.especialidad_id
       join sucursales s on s.id = c.sucursal_id
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

// Confirma que el paciente no tenga otra cita (no cancelada) que se cruce
// con el horario indicado, sin importar la sucursal ni el doctor -- un
// paciente no puede estar en dos citas al mismo tiempo, aunque sean con
// doctores distintos en sucursales distintas. El chequeo es por
// superposicion de horario, no por "mismo dia": el mismo paciente si puede
// tener citas distintas el mismo dia en sucursales distintas, siempre que
// no se crucen en el tiempo. Ver DISENO-ZONA-HORARIA-SUCURSALES.md 4.1.a.
async function hayChoqueDePaciente({ empresaId, pacienteId, fecha, horaInicio, horaFin, excluirCitaId }) {
  const valores = [pacienteId, fecha, horaInicio, horaFin, empresaId];
  let exclusion = '';
  if (excluirCitaId) {
    valores.push(excluirCitaId);
    exclusion = `and id <> $${valores.length}`;
  }
  const { rows } = await pool.query(
    `select 1 from citas
     where paciente_id = $1 and fecha = $2 and empresa_id = $5
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
    const { paciente_id, doctor_id, fecha, hora_inicio, hora_fin, motivo, observaciones, estado, sucursal_id } = req.body;

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

    const choqueDoctor = await hayChoqueDeHorario({ empresaId: req.empresaId, doctorId: doctor_id, fecha, horaInicio: hora_inicio, horaFin: hora_fin });
    if (choqueDoctor) {
      return res.status(409).json({ mensaje: 'El doctor ya tiene una cita agendada que se cruza con ese horario.' });
    }

    const choquePaciente = await hayChoqueDePaciente({ empresaId: req.empresaId, pacienteId: paciente_id, fecha, horaInicio: hora_inicio, horaFin: hora_fin });
    if (choquePaciente) {
      return res.status(409).json({ mensaje: 'El paciente ya tiene otra cita agendada que se cruza con ese horario.' });
    }

    const sucursalId = await resolverSucursal(sucursal_id, req.empresaId);
    if (!sucursalId) return res.status(400).json({ mensaje: 'La sucursal indicada no existe o no pertenece a esta clinica.' });

    const log = primerEventoLog(req.usuario?.nombre, 'Cita creada');
    const { rows } = await pool.query(
      `insert into citas (empresa_id, sucursal_id, paciente_id, doctor_id, fecha, hora_inicio, hora_fin, motivo, observaciones, estado, log)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9, coalesce($10, 'pendiente'), $11::jsonb) returning *`,
      [req.empresaId, sucursalId, paciente_id, doctor_id, fecha, hora_inicio, hora_fin, motivo, observaciones, estado, log]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

// PUT /api/citas/:id
async function actualizar(req, res, next) {
  try {
    const { fecha, hora_inicio, hora_fin, estado, motivo, observaciones, sucursal_id } = req.body;

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
      const choqueDoctor = await hayChoqueDeHorario({
        empresaId: req.empresaId, doctorId: cita.doctor_id, fecha: nuevaFecha,
        horaInicio: nuevaHoraInicio, horaFin: nuevaHoraFin, excluirCitaId: cita.id,
      });
      if (choqueDoctor) {
        return res.status(409).json({ mensaje: 'El doctor ya tiene una cita agendada que se cruza con ese horario.' });
      }

      const choquePaciente = await hayChoqueDePaciente({
        empresaId: req.empresaId, pacienteId: cita.paciente_id, fecha: nuevaFecha,
        horaInicio: nuevaHoraInicio, horaFin: nuevaHoraFin, excluirCitaId: cita.id,
      });
      if (choquePaciente) {
        return res.status(409).json({ mensaje: 'El paciente ya tiene otra cita agendada que se cruza con ese horario.' });
      }
    }

    let sucursalId = null;
    if (sucursal_id) {
      sucursalId = await resolverSucursal(sucursal_id, req.empresaId);
      if (!sucursalId) return res.status(400).json({ mensaje: 'La sucursal indicada no existe o no pertenece a esta clinica.' });
    }

    // El formulario de edicion siempre reenvia el estado con el que cargo
    // (incluyendo 'reagendar'), aunque el usuario solo haya venido a
    // cambiarle la fecha/hora. Si de verdad le da una fecha u horario
    // nuevo y no eligio explicitamente otro estado, se considera
    // reagendada y vuelve sola a 'pendiente' -- si el usuario si eligio
    // otro estado (confirmada, cancelada, etc.) se respeta tal cual.
    let nuevoEstado = estado;
    const fechaCambio = fecha && fecha !== fechaComoTexto(cita.fecha);
    const horaCambio =
      (hora_inicio && hora_inicio.substring(0, 5) !== cita.hora_inicio.substring(0, 5)) ||
      (hora_fin && hora_fin.substring(0, 5) !== cita.hora_fin.substring(0, 5));
    if (cita.estado === 'reagendar' && estado === 'reagendar' && (fechaCambio || horaCambio)) {
      nuevoEstado = 'pendiente';
    }

    await pool.query(
      `update citas set
         fecha = coalesce($1, fecha),
         hora_inicio = coalesce($2, hora_inicio),
         hora_fin = coalesce($3, hora_fin),
         estado = coalesce($4, estado),
         motivo = coalesce($5, motivo),
         observaciones = coalesce($6, observaciones),
         sucursal_id = coalesce($7, sucursal_id)
       where id = $8 and empresa_id = $9`,
      [fecha, hora_inicio, hora_fin, nuevoEstado, motivo, observaciones, sucursalId, req.params.id, req.empresaId]
    );

    const eventos = [];
    if (fechaCambio || horaCambio) {
      eventos.push({
        nota: 'Horario',
        anterior: `${fechaComoTexto(cita.fecha)} ${cita.hora_inicio.substring(0, 5)}-${cita.hora_fin.substring(0, 5)}`,
        nuevo: `${fecha || fechaComoTexto(cita.fecha)} ${nuevaHoraInicio.substring(0, 5)}-${nuevaHoraFin.substring(0, 5)}`,
      });
    }
    if (sucursalId && sucursalId !== cita.sucursal_id) {
      const nombres = await pool.query(
        'select id, nombre from sucursales where id = any($1::uuid[])',
        [[cita.sucursal_id, sucursalId]]
      );
      const nombrePorId = Object.fromEntries(nombres.rows.map((r) => [r.id, r.nombre]));
      eventos.push({
        nota: 'Sucursal',
        anterior: nombrePorId[cita.sucursal_id] || cita.sucursal_id,
        nuevo: nombrePorId[sucursalId] || sucursalId,
      });
    }
    if (nuevoEstado && nuevoEstado !== cita.estado) {
      eventos.push({ nota: 'Estado', anterior: cita.estado, nuevo: nuevoEstado });
    }
    // (motivo || '') !== (cita.motivo || ''): el formulario reenvia '' para
    // "sin motivo" pero en la base puede estar guardado como null -- sin
    // normalizar, '' !== null se veia como un cambio real y generaba una
    // entrada falsa "(vacio) -> (vacio)" en el log.
    if (motivo !== undefined && (motivo || '') !== (cita.motivo || '')) {
      eventos.push({ nota: 'Motivo', anterior: cita.motivo || '(vacio)', nuevo: motivo || '(vacio)' });
    }
    if (observaciones !== undefined && (observaciones || '') !== (cita.observaciones || '')) {
      eventos.push({ nota: 'Observaciones', anterior: cita.observaciones || '(vacio)', nuevo: observaciones || '(vacio)' });
    }
    if (!eventos.length) eventos.push({ nota: 'Cita actualizada' });
    await registrarEventosCita(pool, req.params.id, req.usuario?.nombre, eventos);

    const final = await pool.query('select * from citas where id = $1', [req.params.id]);
    res.json(final.rows[0]);
  } catch (err) { next(err); }
}

function fechaComoTexto(fecha) {
  if (typeof fecha === 'string') return fecha.substring(0, 10);
  return fecha.toISOString().substring(0, 10);
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
