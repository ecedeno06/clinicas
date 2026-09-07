const { pool } = require('../config/db');
const { registrarEventosCita, primerEventoLog } = require('../utils/citaLog');
const { resolverSucursal } = require('../utils/sucursales');
const { hayChoqueCampanaParaCita } = require('../utils/choqueCampana');

// GET /api/citas?doctor_id=&paciente_id=&estado=&desde=&hasta=&sucursal_id=&campana_id=
async function listar(req, res, next) {
  try {
    const { doctor_id, paciente_id, estado, desde, hasta, sucursal_id, campana_id } = req.query;
    const condiciones = ['c.empresa_id = $1'];
    const valores = [req.empresaId];

    if (doctor_id) { valores.push(doctor_id); condiciones.push(`c.doctor_id = $${valores.length}`); }
    if (paciente_id) { valores.push(paciente_id); condiciones.push(`c.paciente_id = $${valores.length}`); }
    if (estado) { valores.push(estado); condiciones.push(`c.estado = $${valores.length}`); }
    if (desde) { valores.push(desde); condiciones.push(`c.fecha >= $${valores.length}`); }
    if (hasta) { valores.push(hasta); condiciones.push(`c.fecha <= $${valores.length}`); }
    if (sucursal_id) { valores.push(sucursal_id); condiciones.push(`c.sucursal_id = $${valores.length}`); }
    if (campana_id) { valores.push(campana_id); condiciones.push(`c.campana_id = $${valores.length}`); }

    const where = `where ${condiciones.join(' and ')}`;

    const { rows } = await pool.query(
      `select c.*, p.nombre as paciente_nombre, p.telefono as paciente_telefono, p.acepta_whatsapp as paciente_acepta_whatsapp,
              d.nombre as doctor_nombre,
              coalesce(
                (select esp.nombre from especialidades esp where esp.id = c.especialidad_id),
                (select string_agg(esp2.nombre, ', ' order by esp2.nombre)
                 from doctor_especialidades de2 join especialidades esp2 on esp2.id = de2.especialidad_id
                 where de2.doctor_id = d.id)
              ) as especialidad_nombre,
              s.nombre as sucursal_nombre, s.direccion as sucursal_direccion, s.google_maps_url as sucursal_google_maps_url,
              s.hora_apertura as sucursal_hora_apertura, s.hora_cierre as sucursal_hora_cierre,
              camp.nombre as campana_nombre,
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
       join sucursales s on s.id = c.sucursal_id
       left join campanas camp on camp.id = c.campana_id
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
              d.nombre as doctor_nombre,
              coalesce(
                (select esp.nombre from especialidades esp where esp.id = c.especialidad_id),
                (select string_agg(esp2.nombre, ', ' order by esp2.nombre)
                 from doctor_especialidades de2 join especialidades esp2 on esp2.id = de2.especialidad_id
                 where de2.doctor_id = d.id)
              ) as especialidad_nombre,
              s.nombre as sucursal_nombre, s.direccion as sucursal_direccion, s.google_maps_url as sucursal_google_maps_url,
              s.hora_apertura as sucursal_hora_apertura, s.hora_cierre as sucursal_hora_cierre,
              camp.nombre as campana_nombre
       from citas c
       join pacientes p on p.id = c.paciente_id
       join doctores d on d.id = c.doctor_id
       join sucursales s on s.id = c.sucursal_id
       left join campanas camp on camp.id = c.campana_id
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
    const { paciente_id, doctor_id, fecha, hora_inicio, hora_fin, motivo, observaciones, estado, sucursal_id, campana_id, especialidad_id, es_domicilio, es_urgencia } = req.body;

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

    // Una urgencia puede asignar cualquier doctor sin que sus compromisos
    // de horario lo bloqueen -- solo se salta lo que depende del horario
    // DEL DOCTOR (otra cita suya, un compromiso de campana confirmado);
    // el choque contra otra cita del PACIENTE se sigue validando siempre.
    if (!es_urgencia) {
      const choqueDoctor = await hayChoqueDeHorario({ empresaId: req.empresaId, doctorId: doctor_id, fecha, horaInicio: hora_inicio, horaFin: hora_fin });
      if (choqueDoctor) {
        return res.status(409).json({ mensaje: 'El doctor ya tiene una cita agendada que se cruza con ese horario.' });
      }

      // El doctor no puede tener un compromiso de campana confirmado que se
      // cruce con este horario (si esta cita es en si de una campana, no
      // choca contra el compromiso de esa misma campana). Ver
      // DISENO-CAMPANAS-MEDICAS.md seccion 9.
      const choqueCampana = await hayChoqueCampanaParaCita({ doctorId: doctor_id, fecha, horaInicio: hora_inicio, horaFin: hora_fin, excluirCampanaId: campana_id || null });
      if (choqueCampana) {
        return res.status(409).json({ mensaje: 'El doctor tiene un compromiso de campana confirmado que se cruza con ese horario.' });
      }
    }

    const choquePaciente = await hayChoqueDePaciente({ empresaId: req.empresaId, pacienteId: paciente_id, fecha, horaInicio: hora_inicio, horaFin: hora_fin });
    if (choquePaciente) {
      return res.status(409).json({ mensaje: 'El paciente ya tiene otra cita agendada que se cruza con ese horario.' });
    }

    const sucursalId = await resolverSucursal(sucursal_id, req.empresaId);
    if (!sucursalId) return res.status(400).json({ mensaje: 'La sucursal indicada no existe o no pertenece a esta clinica.' });

    // Una cita de campana sigue siendo una cita normal (mismo insert de
    // siempre) -- solo se valida que la campana este aprobada o en_curso
    // (permite pre-agendar antes del dia del evento, una vez aprobada) y
    // que el doctor este invitado a ella (invitado o confirmado, no
    // rechazado), para no dejar agendar a nombre de una campana a un
    // doctor que nunca fue convocado. Ver DISENO-CAMPANAS-MEDICAS.md
    // secciones 6 y 9.
    if (campana_id) {
      const campana = await pool.query(
        'select estado, hora_inicio, hora_fin from campanas where id = $1 and empresa_id = $2',
        [campana_id, req.empresaId]
      );
      if (!campana.rows[0]) return res.status(400).json({ mensaje: 'La campana indicada no existe o no pertenece a esta clinica.' });
      if (!['aprobada', 'en_curso'].includes(campana.rows[0].estado)) {
        return res.status(400).json({ mensaje: 'Solo se pueden crear citas para una campana aprobada o en curso.' });
      }

      // El horario de la cita no puede salirse del horario declarado de la
      // campana (si no declaro horario, no hay restriccion -- ver
      // campanas.controller.js, hora_inicio/hora_fin son opcionales).
      const { hora_inicio: campanaHoraInicio, hora_fin: campanaHoraFin } = campana.rows[0];
      if (campanaHoraInicio && campanaHoraFin) {
        if (hora_inicio < campanaHoraInicio.substring(0, 5) || hora_fin > campanaHoraFin.substring(0, 5)) {
          return res.status(400).json({
            mensaje: `El horario de la cita debe estar dentro del horario de la campana (${campanaHoraInicio.substring(0, 5)} - ${campanaHoraFin.substring(0, 5)}).`,
          });
        }
      }

      // No se puede agendar una cita de campana en una fecha/hora que ya
      // paso (a diferencia de una cita normal, que si se puede reagendar
      // libremente hacia atras si hiciera falta corregir un registro).
      const fechaHoraCita = new Date(`${fecha}T${hora_inicio}:00`);
      if (fechaHoraCita < new Date()) {
        return res.status(400).json({ mensaje: 'No se puede agendar una cita de campana en una fecha/hora que ya paso.' });
      }

      const invitado = await pool.query(
        `select 1 from campana_doctores where campana_id = $1 and doctor_id = $2 and estado <> 'rechazado'`,
        [campana_id, doctor_id]
      );
      if (!invitado.rows[0]) {
        return res.status(400).json({ mensaje: 'El doctor no esta invitado a esta campana.' });
      }
    }

    const log = primerEventoLog(req.usuario?.nombre, 'Cita creada');
    const { rows } = await pool.query(
      `insert into citas (empresa_id, sucursal_id, paciente_id, doctor_id, campana_id, especialidad_id, es_domicilio, es_urgencia, fecha, hora_inicio, hora_fin, motivo, observaciones, estado, log)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, coalesce($14, 'pendiente'), $15::jsonb) returning *`,
      [req.empresaId, sucursalId, paciente_id, doctor_id, campana_id || null, especialidad_id || null, !!es_domicilio, !!es_urgencia, fecha, hora_inicio, hora_fin, motivo, observaciones, estado, log]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

// PUT /api/citas/:id
async function actualizar(req, res, next) {
  try {
    const { fecha, hora_inicio, hora_fin, estado, motivo, observaciones, sucursal_id, es_domicilio, es_urgencia } = req.body;

    const actual = await pool.query('select * from citas where id = $1 and empresa_id = $2', [req.params.id, req.empresaId]);
    if (!actual.rows[0]) return res.status(404).json({ mensaje: 'Cita no encontrada' });
    const cita = actual.rows[0];

    const nuevaFecha = fecha || cita.fecha;
    const nuevaHoraInicio = hora_inicio || cita.hora_inicio;
    const nuevaHoraFin = hora_fin || cita.hora_fin;
    if (nuevaHoraFin <= nuevaHoraInicio) {
      return res.status(400).json({ mensaje: 'La hora de fin debe ser posterior a la hora de inicio.' });
    }

    // Urgencia efectiva para esta edicion: el valor nuevo si se esta
    // corrigiendo ahora mismo (y la cita sigue pendiente), si no el que ya
    // tenia guardado. Igual que en crear(), una urgencia salta los choques
    // que dependen del horario DEL DOCTOR, pero no el del paciente.
    const urgenciaEfectiva = es_urgencia !== undefined && cita.estado === 'pendiente' ? es_urgencia : cita.es_urgencia;

    if (fecha || hora_inicio || hora_fin) {
      if (!urgenciaEfectiva) {
        const choqueDoctor = await hayChoqueDeHorario({
          empresaId: req.empresaId, doctorId: cita.doctor_id, fecha: nuevaFecha,
          horaInicio: nuevaHoraInicio, horaFin: nuevaHoraFin, excluirCitaId: cita.id,
        });
        if (choqueDoctor) {
          return res.status(409).json({ mensaje: 'El doctor ya tiene una cita agendada que se cruza con ese horario.' });
        }

        const choqueCampana = await hayChoqueCampanaParaCita({
          doctorId: cita.doctor_id, fecha: nuevaFecha, horaInicio: nuevaHoraInicio, horaFin: nuevaHoraFin,
          excluirCampanaId: cita.campana_id,
        });
        if (choqueCampana) {
          return res.status(409).json({ mensaje: 'El doctor tiene un compromiso de campana confirmado que se cruza con ese horario.' });
        }
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

    // Visita a domicilio y urgencia solo se pueden corregir mientras la
    // cita sigue pendiente -- una vez confirmada/atendida/cancelada/etc.
    // quedan fijas (evita cambiar retroactivamente algo que ya paso).
    const esDomicilioNuevo = es_domicilio !== undefined && cita.estado === 'pendiente' ? es_domicilio : null;
    const esUrgenciaNuevo = es_urgencia !== undefined && cita.estado === 'pendiente' ? es_urgencia : null;

    await pool.query(
      `update citas set
         fecha = coalesce($1, fecha),
         hora_inicio = coalesce($2, hora_inicio),
         hora_fin = coalesce($3, hora_fin),
         estado = coalesce($4, estado),
         motivo = coalesce($5, motivo),
         observaciones = coalesce($6, observaciones),
         sucursal_id = coalesce($7, sucursal_id),
         es_domicilio = coalesce($8, es_domicilio),
         es_urgencia = coalesce($9, es_urgencia)
       where id = $10 and empresa_id = $11`,
      [fecha, hora_inicio, hora_fin, nuevoEstado, motivo, observaciones, sucursalId, esDomicilioNuevo, esUrgenciaNuevo, req.params.id, req.empresaId]
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
    if (esDomicilioNuevo !== null && esDomicilioNuevo !== cita.es_domicilio) {
      eventos.push({ nota: 'Visita a domicilio', anterior: cita.es_domicilio ? 'Si' : 'No', nuevo: esDomicilioNuevo ? 'Si' : 'No' });
    }
    if (esUrgenciaNuevo !== null && esUrgenciaNuevo !== cita.es_urgencia) {
      eventos.push({ nota: 'Urgencia', anterior: cita.es_urgencia ? 'Si' : 'No', nuevo: esUrgenciaNuevo ? 'Si' : 'No' });
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
