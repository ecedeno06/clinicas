const { pool } = require('../config/db');

// GET /api/citas/:citaId/signos-vitales
async function obtenerPorCita(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select sv.* from signos_vitales sv
       join citas c on c.id = sv.cita_id
       where sv.cita_id = $1 and c.empresa_id = $2`,
      [req.params.citaId, req.empresaId]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Esta cita todavia no tiene signos vitales registrados' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

// POST /api/citas/:citaId/signos-vitales  { temperatura, peso, talla, presion_sistolica, presion_diastolica, glucosa }
// Se registran al llegar el paciente a la cita, independiente de si el doctor
// ya creo la historia clinica.
async function crear(req, res, next) {
  try {
    const cita = await pool.query('select * from citas where id = $1 and empresa_id = $2', [req.params.citaId, req.empresaId]);
    if (!cita.rows[0]) return res.status(404).json({ mensaje: 'Cita no encontrada' });

    const existente = await pool.query('select id from signos_vitales where cita_id = $1', [req.params.citaId]);
    if (existente.rows[0]) return res.status(409).json({ mensaje: 'Esta cita ya tiene signos vitales registrados' });

    const c = cita.rows[0];
    const { temperatura, peso, talla, presion_sistolica, presion_diastolica, glucosa, glucosa_glicosilada } = req.body;

    const { rows } = await pool.query(
      `insert into signos_vitales (empresa_id, cita_id, paciente_id, temperatura, peso, talla, presion_sistolica, presion_diastolica, glucosa, glucosa_glicosilada)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [req.empresaId, c.id, c.paciente_id, temperatura, peso, talla, presion_sistolica, presion_diastolica, glucosa, glucosa_glicosilada]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23514') return res.status(400).json({ mensaje: 'Uno o mas valores estan fuera de rango.' });
    next(err);
  }
}

// PUT /api/citas/:citaId/signos-vitales
async function actualizar(req, res, next) {
  try {
    const { temperatura, peso, talla, presion_sistolica, presion_diastolica, glucosa, glucosa_glicosilada } = req.body;
    const { rows } = await pool.query(
      `update signos_vitales sv set
         temperatura = coalesce($1, temperatura),
         peso = coalesce($2, peso),
         talla = coalesce($3, talla),
         presion_sistolica = coalesce($4, presion_sistolica),
         presion_diastolica = coalesce($5, presion_diastolica),
         glucosa = coalesce($6, glucosa),
         glucosa_glicosilada = coalesce($7, glucosa_glicosilada)
       from citas c
       where sv.cita_id = $8 and sv.cita_id = c.id and c.empresa_id = $9
       returning sv.*`,
      [temperatura, peso, talla, presion_sistolica, presion_diastolica, glucosa, glucosa_glicosilada, req.params.citaId, req.empresaId]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Esta cita todavia no tiene signos vitales registrados' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23514') return res.status(400).json({ mensaje: 'Uno o mas valores estan fuera de rango.' });
    next(err);
  }
}

module.exports = { obtenerPorCita, crear, actualizar };
