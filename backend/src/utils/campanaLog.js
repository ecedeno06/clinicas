// Mismo patron que utils/citaLog.js, pero para la bitacora de auditoria
// de campanas (campanas.log jsonb array). Ver ese archivo para el detalle
// del formato de cada entrada.
async function registrarEventosCampana(ejecutor, campanaId, usuario, eventos) {
  if (!eventos || !eventos.length) return;
  const fecha = new Date().toISOString();
  const nuevasEntradas = eventos.map((ev) => ({
    fecha,
    usuario: usuario || 'Sistema',
    nota: ev.nota,
    anterior: ev.anterior ?? null,
    nuevo: ev.nuevo ?? null,
  }));
  await ejecutor.query(`update campanas set log = log || $1::jsonb where id = $2`, [JSON.stringify(nuevasEntradas), campanaId]);
}

async function registrarEventoCampana(ejecutor, campanaId, usuario, nota, anterior, nuevo) {
  await registrarEventosCampana(ejecutor, campanaId, usuario, [{ nota, anterior, nuevo }]);
}

function primerEventoLogCampana(usuario, nota) {
  return JSON.stringify([{ fecha: new Date().toISOString(), usuario: usuario || 'Sistema', nota, anterior: null, nuevo: null }]);
}

module.exports = { registrarEventoCampana, registrarEventosCampana, primerEventoLogCampana };
