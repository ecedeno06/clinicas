const { pool } = require('../config/db');

// GET /api/reportes/diagnosticos?desde=&hasta=&sucursal_id=
// Una fila por cita ATENDIDA con historia clinica (diagnostico
// registrado) -- una cita sin historia todavia no tiene nada que
// reportar aca. Los medicamentos son el agregado de TODAS las recetas de
// esa cita (puede haber mas de una, ver recetas.controller.js), como
// texto separado por comas -- este reporte es de lectura, no vincula a
// una receta puntual.
async function diagnosticos(req, res, next) {
  try {
    const { desde, hasta, sucursal_id } = req.query;
    const condiciones = ['c.empresa_id = $1', 'hc.diagnostico is not null', "hc.diagnostico <> ''"];
    const valores = [req.empresaId];

    if (desde) { valores.push(desde); condiciones.push(`c.fecha >= $${valores.length}`); }
    if (hasta) { valores.push(hasta); condiciones.push(`c.fecha <= $${valores.length}`); }
    if (sucursal_id) { valores.push(sucursal_id); condiciones.push(`c.sucursal_id = $${valores.length}`); }

    const where = `where ${condiciones.join(' and ')}`;

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

module.exports = { diagnosticos };
