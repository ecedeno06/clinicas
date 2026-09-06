const { pool } = require('../config/db');

// Un doctor confirmado en una campana queda "ocupado" para esa campana
// durante toda su ventana -- si la campana no tiene hora_inicio/hora_fin
// definida, se trata como bloqueando el dia completo (mismo criterio en
// ambas direcciones de este archivo). Ver DISENO-CAMPANAS-MEDICAS.md
// seccion 9.
function seCruzanHoras(aInicio, aFin, bInicio, bFin) {
  if (!aInicio || !aFin || !bInicio || !bFin) return true;
  return aInicio < bFin && bInicio < aFin;
}

// Doctor confirmado en otra campana (distinta de excluirCampanaId) cuyo
// rango de fechas incluye `fecha` y cuyo horario se cruza con
// [horaInicio, horaFin). Se usa al crear/editar una cita (normal o de
// otra campana) para no agendar a un doctor mientras esta comprometido en
// una campana distinta.
async function hayChoqueCampanaParaCita({ doctorId, fecha, horaInicio, horaFin, excluirCampanaId }) {
  const { rows } = await pool.query(
    `select c.hora_inicio, c.hora_fin from campanas c
     join campana_doctores cd on cd.campana_id = c.id
     where cd.doctor_id = $1 and cd.estado = 'confirmado'
       and $2::date between c.fecha_inicio and c.fecha_fin
       and c.id is distinct from $3`,
    [doctorId, fecha, excluirCampanaId || null]
  );
  return rows.some((r) => seCruzanHoras(horaInicio, horaFin, r.hora_inicio, r.hora_fin));
}

// El doctor ya tiene una cita (normal o de otra campana) que cae dentro
// del rango de fechas/horario de esta campana. Se usa al confirmar un
// doctor para una campana.
async function hayCitaConflictivaConCampana({ doctorId, campanaId, fechaInicio, fechaFin, horaInicio, horaFin }) {
  const { rows } = await pool.query(
    `select hora_inicio, hora_fin from citas
     where doctor_id = $1 and estado <> 'cancelada'
       and fecha between $2 and $3
       and campana_id is distinct from $4`,
    [doctorId, fechaInicio, fechaFin, campanaId]
  );
  return rows.some((r) => seCruzanHoras(horaInicio, horaFin, r.hora_inicio, r.hora_fin));
}

// El doctor ya esta confirmado en otra campana cuyo rango de fechas se
// cruza con el de esta. Se usa al confirmar un doctor para una campana.
async function hayOtraCampanaConflictiva({ doctorId, campanaId, fechaInicio, fechaFin, horaInicio, horaFin }) {
  const { rows } = await pool.query(
    `select c.hora_inicio, c.hora_fin from campanas c
     join campana_doctores cd on cd.campana_id = c.id
     where cd.doctor_id = $1 and cd.estado = 'confirmado' and c.id <> $2
       and c.fecha_inicio <= $4 and c.fecha_fin >= $3`,
    [doctorId, campanaId, fechaInicio, fechaFin]
  );
  return rows.some((r) => seCruzanHoras(horaInicio, horaFin, r.hora_inicio, r.hora_fin));
}

module.exports = { hayChoqueCampanaParaCita, hayCitaConflictivaConCampana, hayOtraCampanaConflictiva };
