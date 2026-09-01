const { pool } = require('../config/db');

// GET /api/citas/:citaId/historia
async function obtenerPorCita(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select hc.* from historias_clinicas hc
       join citas c on c.id = hc.cita_id
       where hc.cita_id = $1 and c.empresa_id = $2`,
      [req.params.citaId, req.empresaId]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Esta cita todavia no tiene historia clinica' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

// POST /api/citas/:citaId/historia  { motivo_consulta, diagnostico, tratamiento, notas }
// Crea la historia clinica de la cita y la marca como 'atendida'.
async function crear(req, res, next) {
  try {
    const cita = await pool.query('select * from citas where id = $1 and empresa_id = $2', [req.params.citaId, req.empresaId]);
    if (!cita.rows[0]) return res.status(404).json({ mensaje: 'Cita no encontrada' });

    const existente = await pool.query('select id from historias_clinicas where cita_id = $1', [req.params.citaId]);
    if (existente.rows[0]) return res.status(409).json({ mensaje: 'Esta cita ya tiene una historia clinica registrada' });

    const { motivo_consulta, diagnostico, tratamiento, notas } = req.body;
    const c = cita.rows[0];

    const { rows } = await pool.query(
      `insert into historias_clinicas (empresa_id, cita_id, paciente_id, doctor_id, motivo_consulta, diagnostico, tratamiento, notas)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [req.empresaId, c.id, c.paciente_id, c.doctor_id, motivo_consulta, diagnostico, tratamiento, notas]
    );

    await pool.query("update citas set estado = 'atendida' where id = $1", [c.id]);

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

// PUT /api/citas/:citaId/historia
async function actualizar(req, res, next) {
  try {
    const { motivo_consulta, diagnostico, tratamiento, notas } = req.body;
    const { rows } = await pool.query(
      `update historias_clinicas hc set
         motivo_consulta = coalesce($1, motivo_consulta),
         diagnostico = coalesce($2, diagnostico),
         tratamiento = coalesce($3, tratamiento),
         notas = coalesce($4, notas)
       from citas c
       where hc.cita_id = $5 and hc.cita_id = c.id and c.empresa_id = $6
       returning hc.*`,
      [motivo_consulta, diagnostico, tratamiento, notas, req.params.citaId, req.empresaId]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Esta cita todavia no tiene historia clinica' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

module.exports = { obtenerPorCita, crear, actualizar };
