const { pool } = require('../config/db');

async function cargarExamenes(ordenId) {
  const { rows } = await pool.query(
    'select * from orden_laboratorio_examenes where orden_id = $1 order by orden asc, created_at asc',
    [ordenId]
  );
  return rows;
}

// GET /api/laboratorio/pendientes
// Todas las ordenes de laboratorio en estado "pendiente" de la clinica,
// con los datos de la cita/paciente/doctor -- para el card del tablero.
async function listarPendientes(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select ol.id as orden_id, ol.created_at,
              c.id as cita_id, c.fecha, c.hora_inicio,
              p.id as paciente_id, p.nombre as paciente_nombre,
              d.nombre as doctor_nombre, e.nombre as especialidad_nombre
       from ordenes_laboratorio ol
       join citas c on c.id = ol.cita_id
       join pacientes p on p.id = ol.paciente_id
       join doctores d on d.id = ol.doctor_id
       join especialidades e on e.id = d.especialidad_id
       where ol.empresa_id = $1 and ol.estado = 'pendiente'
       order by c.fecha asc, c.hora_inicio asc`,
      [req.empresaId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// GET /api/citas/:citaId/laboratorio
// Una cita puede tener varias ordenes de laboratorio (ej. una orden de
// rutina y luego una de control), asi que devuelve una lista.
async function listarPorCita(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select o.* from ordenes_laboratorio o
       join citas c on c.id = o.cita_id
       where o.cita_id = $1 and c.empresa_id = $2
       order by o.created_at asc`,
      [req.params.citaId, req.empresaId]
    );

    const ordenes = await Promise.all(
      rows.map(async (o) => ({ ...o, examenes: await cargarExamenes(o.id) }))
    );
    res.json(ordenes);
  } catch (err) { next(err); }
}

// POST /api/citas/:citaId/laboratorio  { observaciones, examenes: [{ nombre_examen, valor_referencia }] }
async function crear(req, res, next) {
  const client = await pool.connect();
  try {
    const cita = await client.query('select * from citas where id = $1 and empresa_id = $2', [req.params.citaId, req.empresaId]);
    if (!cita.rows[0]) return res.status(404).json({ mensaje: 'Cita no encontrada' });

    const { observaciones, examenes } = req.body;
    if (!Array.isArray(examenes) || examenes.length === 0) {
      return res.status(400).json({ mensaje: 'La orden debe tener al menos un examen' });
    }

    const c = cita.rows[0];

    await client.query('begin');
    const { rows } = await client.query(
      `insert into ordenes_laboratorio (empresa_id, cita_id, paciente_id, doctor_id, observaciones)
       values ($1,$2,$3,$4,$5) returning *`,
      [req.empresaId, c.id, c.paciente_id, c.doctor_id, observaciones]
    );
    const orden = rows[0];

    for (let i = 0; i < examenes.length; i++) {
      const e = examenes[i];
      await client.query(
        `insert into orden_laboratorio_examenes (orden_id, nombre_examen, valor_referencia, resultado, unidad, orden)
         values ($1,$2,$3,$4,$5,$6)`,
        [orden.id, e.nombre_examen, e.valor_referencia, e.resultado, e.unidad, i]
      );
    }
    await client.query('commit');

    const examenesGuardados = await cargarExamenes(orden.id);
    res.status(201).json({ ...orden, examenes: examenesGuardados });
  } catch (err) {
    await client.query('rollback');
    next(err);
  } finally {
    client.release();
  }
}

// PUT /api/laboratorio/:ordenId  { estado, observaciones, examenes: [...] }
// Reemplaza la lista completa de examenes de ESA orden puntual (no se
// editan uno a uno) -- se usa tanto para corregir lo solicitado como para
// cargar resultados. Tambien permite cambiar el estado (ej. a "completada").
async function actualizar(req, res, next) {
  const client = await pool.connect();
  try {
    const actual = await client.query(
      `select o.* from ordenes_laboratorio o
       join citas c on c.id = o.cita_id
       where o.id = $1 and c.empresa_id = $2`,
      [req.params.ordenId, req.empresaId]
    );
    if (!actual.rows[0]) return res.status(404).json({ mensaje: 'Orden de laboratorio no encontrada' });

    const { estado, observaciones, examenes } = req.body;
    if (!Array.isArray(examenes) || examenes.length === 0) {
      return res.status(400).json({ mensaje: 'La orden debe tener al menos un examen' });
    }

    const orden = actual.rows[0];

    await client.query('begin');
    await client.query(
      `update ordenes_laboratorio set
         estado = coalesce($1, estado),
         observaciones = coalesce($2, observaciones)
       where id = $3`,
      [estado, observaciones, orden.id]
    );
    await client.query('delete from orden_laboratorio_examenes where orden_id = $1', [orden.id]);
    for (let i = 0; i < examenes.length; i++) {
      const e = examenes[i];
      await client.query(
        `insert into orden_laboratorio_examenes (orden_id, nombre_examen, valor_referencia, resultado, unidad, orden)
         values ($1,$2,$3,$4,$5,$6)`,
        [orden.id, e.nombre_examen, e.valor_referencia, e.resultado, e.unidad, i]
      );
    }
    await client.query('commit');

    const { rows } = await client.query('select * from ordenes_laboratorio where id = $1', [orden.id]);
    const examenesGuardados = await cargarExamenes(orden.id);
    res.json({ ...rows[0], examenes: examenesGuardados });
  } catch (err) {
    await client.query('rollback');
    if (err.code === '23514') return res.status(400).json({ mensaje: 'Estado invalido.' });
    next(err);
  } finally {
    client.release();
  }
}

// DELETE /api/laboratorio/:ordenId
async function eliminar(req, res, next) {
  try {
    const { rowCount } = await pool.query(
      `delete from ordenes_laboratorio o using citas c
       where o.cita_id = c.id and o.id = $1 and c.empresa_id = $2`,
      [req.params.ordenId, req.empresaId]
    );
    if (!rowCount) return res.status(404).json({ mensaje: 'Orden de laboratorio no encontrada' });
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { listarPorCita, listarPendientes, crear, actualizar, eliminar };
