const { pool } = require('../config/db');

// Condiciones de filtro comunes a los 3 reportes (siempre contra
// citas.fecha/sucursal_id, sin importar de que tabla venga cada fila).
function condicionesFecha(req, condicionesBase) {
  const { desde, hasta, sucursal_id } = req.query;
  const condiciones = [...condicionesBase];
  const valores = [req.empresaId];

  if (desde) { valores.push(desde); condiciones.push(`c.fecha >= $${valores.length}`); }
  if (hasta) { valores.push(hasta); condiciones.push(`c.fecha <= $${valores.length}`); }
  if (sucursal_id) { valores.push(sucursal_id); condiciones.push(`c.sucursal_id = $${valores.length}`); }

  return { where: `where ${condiciones.join(' and ')}`, valores };
}

// GET /api/reportes/diagnosticos?desde=&hasta=&sucursal_id=
// Una fila por cita ATENDIDA con historia clinica (diagnostico
// registrado) -- una cita sin historia todavia no tiene nada que
// reportar aca. Los medicamentos son el agregado de TODAS las recetas de
// esa cita (puede haber mas de una, ver recetas.controller.js), como
// texto separado por comas -- este reporte es de lectura, no vincula a
// una receta puntual.
async function diagnosticos(req, res, next) {
  try {
    const { where, valores } = condicionesFecha(req, ['c.empresa_id = $1', 'hc.diagnostico is not null', "hc.diagnostico <> ''"]);

    const { rows } = await pool.query(
      `select c.id as cita_id, c.fecha, c.hora_inicio, c.hora_fin,
              p.nombre as paciente_nombre,
              hc.diagnostico,
              d.nombre as doctor_nombre,
              s.nombre as sucursal_nombre,
              (
                select string_agg(distinct rm.medicamento, ', ' order by rm.medicamento)
                from recetas r
                join receta_medicamentos rm on rm.receta_id = r.id
                where r.cita_id = c.id
              ) as medicamentos
       from citas c
       join historias_clinicas hc on hc.cita_id = c.id
       join pacientes p on p.id = c.paciente_id
       join doctores d on d.id = c.doctor_id
       join sucursales s on s.id = c.sucursal_id
       ${where}
       order by c.fecha desc, c.hora_inicio desc`,
      valores
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// GET /api/reportes/medicamentos?desde=&hasta=&sucursal_id=
// Una fila por MEDICAMENTO (no por cita ni por receta): una cita puede
// tener varias recetas (ver recetas.controller.js), y cada receta varios
// medicamentos -- a diferencia del reporte de diagnosticos, aca no se
// agrega nada, cada linea es su propio medicamento con su dosis/
// frecuencia/duracion.
async function medicamentos(req, res, next) {
  try {
    const { where, valores } = condicionesFecha(req, ['c.empresa_id = $1']);

    const { rows } = await pool.query(
      `select rm.id as medicamento_id, c.id as cita_id, c.fecha, c.hora_inicio, c.hora_fin,
              p.nombre as paciente_nombre,
              rm.medicamento, rm.dosis, rm.frecuencia, rm.duracion,
              d.nombre as doctor_nombre,
              s.nombre as sucursal_nombre
       from receta_medicamentos rm
       join recetas r on r.id = rm.receta_id
       join citas c on c.id = r.cita_id
       join pacientes p on p.id = c.paciente_id
       join doctores d on d.id = c.doctor_id
       join sucursales s on s.id = c.sucursal_id
       ${where}
       order by c.fecha desc, c.hora_inicio desc, rm.orden asc`,
      valores
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// GET /api/reportes/laboratorios?desde=&hasta=&sucursal_id=
// Una fila por EXAMEN (no por cita ni por orden): una cita puede tener
// varias ordenes de laboratorio, y cada orden varios examenes -- mismo
// criterio que medicamentos() arriba, sin agregar nada.
async function laboratorios(req, res, next) {
  try {
    const { where, valores } = condicionesFecha(req, ['c.empresa_id = $1']);

    const { rows } = await pool.query(
      `select ole.id as examen_id, c.id as cita_id, c.fecha, c.hora_inicio, c.hora_fin,
              p.nombre as paciente_nombre,
              ole.nombre_examen, ole.resultado, ole.valor_referencia, ole.unidad,
              ol.estado as orden_estado,
              d.nombre as doctor_nombre,
              s.nombre as sucursal_nombre
       from orden_laboratorio_examenes ole
       join ordenes_laboratorio ol on ol.id = ole.orden_id
       join citas c on c.id = ol.cita_id
       join pacientes p on p.id = c.paciente_id
       join doctores d on d.id = c.doctor_id
       join sucursales s on s.id = c.sucursal_id
       ${where}
       order by c.fecha desc, c.hora_inicio desc, ole.orden asc`,
      valores
    );
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { diagnosticos, medicamentos, laboratorios };
