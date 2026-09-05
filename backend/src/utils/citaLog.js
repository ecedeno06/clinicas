// Agrega una o mas entradas {fecha, usuario, nota, anterior, nuevo} al log
// (jsonb array) de una cita -- una por cada campo que cambio en una misma
// interaccion (todas comparten la misma fecha, ya que ocurrieron en el
// mismo request). anterior/nuevo quedan en null cuando no aplica (ej. al
// crear la cita, no hay "valor viejo"). Nunca se edita ni se borra una
// entrada existente, solo se agregan al final.
//
// `ejecutor` puede ser el pool o un client de una transaccion en curso
// (para que la entrada quede atada a la misma transaccion que el resto
// del cambio, ej. al marcar varias citas como 'reagendar').
async function registrarEventosCita(ejecutor, citaId, usuario, eventos) {
  if (!eventos || !eventos.length) return;
  const fecha = new Date().toISOString();
  const nuevasEntradas = eventos.map((ev) => ({
    fecha,
    usuario: usuario || 'Sistema',
    nota: ev.nota,
    anterior: ev.anterior ?? null,
    nuevo: ev.nuevo ?? null,
  }));
  await ejecutor.query(`update citas set log = log || $1::jsonb where id = $2`, [JSON.stringify(nuevasEntradas), citaId]);
}

// Atajo para cuando solo hay un evento que registrar.
async function registrarEventoCita(ejecutor, citaId, usuario, nota, anterior, nuevo) {
  await registrarEventosCita(ejecutor, citaId, usuario, [{ nota, anterior, nuevo }]);
}

// Para usar dentro del propio insert de creacion (un solo viaje a la
// base de datos): arma el jsonb del primer evento del log.
function primerEventoLog(usuario, nota) {
  return JSON.stringify([{ fecha: new Date().toISOString(), usuario: usuario || 'Sistema', nota, anterior: null, nuevo: null }]);
}

module.exports = { registrarEventoCita, registrarEventosCita, primerEventoLog };
