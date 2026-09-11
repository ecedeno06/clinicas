const { pool } = require('../config/db');

// Solo quien creo el antecedente puede editarlo/eliminarlo. Antecedentes
// sin autor conocido (creado_por null -- filas de antes de este campo)
// quedan sin restriccion, mismo criterio que recetas.controller.js.
function puedeModificar(fila, usuario) {
  return !fila.creado_por || fila.creado_por === usuario?.id;
}

const SELECT_ANTECEDENTE = `
  select pa.*, ap.nombre as antecedente_nombre, c.nombre as categoria_nombre,
         u.nombre as creado_por_nombre, d.nombre as doctor_nombre
  from paciente_antecedente pa
  join antecedentes_patologicos ap on ap.id = pa.antecedente_id
  join categorias_antecedentes c on c.id = ap.categoria_id
  left join usuarios u on u.id = pa.creado_por
  left join doctores d on d.id = pa.doctor_id
`;

// paciente_antecedente es global (no tiene empresa_id, viaja con el
// paciente en toda la red) -- la unica verificacion de acceso es que el
// paciente este vinculado a la clinica activa, igual que hace
// pacientes.controller.js.
async function verificarVinculo(pacienteId, empresaId) {
  const { rows } = await pool.query(
    'select 1 from pacientes_empresas where paciente_id = $1 and empresa_id = $2',
    [pacienteId, empresaId]
  );
  return !!rows[0];
}

// GET /api/pacientes/:pacienteId/antecedentes
async function listar(req, res, next) {
  try {
    if (!(await verificarVinculo(req.params.id, req.empresaId))) {
      return res.status(404).json({ mensaje: 'Paciente no encontrado' });
    }
    const { rows } = await pool.query(
      `${SELECT_ANTECEDENTE} where pa.paciente_id = $1 order by c.orden, ap.orden, ap.nombre`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// POST /api/pacientes/:pacienteId/antecedentes  { antecedente_id, fecha_inicio, tratamiento, observacion }
async function crear(req, res, next) {
  try {
    if (!(await verificarVinculo(req.params.id, req.empresaId))) {
      return res.status(404).json({ mensaje: 'Paciente no encontrado' });
    }
    const { antecedente_id, fecha_inicio, tratamiento, observacion, doctor_id } = req.body;
    if (!antecedente_id) return res.status(400).json({ mensaje: 'antecedente_id es requerido' });

    const ins = await pool.query(
      `insert into paciente_antecedente (paciente_id, antecedente_id, fecha_inicio, tratamiento, observacion, doctor_id, creado_por)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [req.params.id, antecedente_id, fecha_inicio || null, tratamiento || null, observacion || null, doctor_id || null, req.usuario?.id]
    );
    const { rows } = await pool.query(`${SELECT_ANTECEDENTE} where pa.id = $1`, [ins.rows[0].id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ mensaje: 'Ya existe este antecedente registrado para el paciente.' });
    if (err.code === '23503') return res.status(400).json({ mensaje: 'El antecedente indicado no existe.' });
    next(err);
  }
}

// PUT /api/paciente-antecedentes/:id  { fecha_inicio, tratamiento, observacion }
async function actualizar(req, res, next) {
  try {
    const { rows: actual } = await pool.query(`${SELECT_ANTECEDENTE} where pa.id = $1`, [req.params.id]);
    if (!actual[0]) return res.status(404).json({ mensaje: 'Antecedente no encontrado' });
    if (!(await verificarVinculo(actual[0].paciente_id, req.empresaId))) {
      return res.status(404).json({ mensaje: 'Antecedente no encontrado' });
    }
    if (!puedeModificar(actual[0], req.usuario)) {
      return res.status(403).json({ mensaje: 'Solo el usuario que creo este antecedente puede editarlo' });
    }

    const { fecha_inicio, tratamiento, observacion, doctor_id } = req.body;
    await pool.query(
      `update paciente_antecedente set
         fecha_inicio = $1, tratamiento = $2, observacion = $3, doctor_id = $4
       where id = $5`,
      [fecha_inicio || null, tratamiento || null, observacion || null, doctor_id || null, req.params.id]
    );
    const { rows } = await pool.query(`${SELECT_ANTECEDENTE} where pa.id = $1`, [req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
}

// DELETE /api/paciente-antecedentes/:id
async function eliminar(req, res, next) {
  try {
    const { rows: actual } = await pool.query(`${SELECT_ANTECEDENTE} where pa.id = $1`, [req.params.id]);
    if (!actual[0]) return res.status(404).json({ mensaje: 'Antecedente no encontrado' });
    if (!(await verificarVinculo(actual[0].paciente_id, req.empresaId))) {
      return res.status(404).json({ mensaje: 'Antecedente no encontrado' });
    }
    if (!puedeModificar(actual[0], req.usuario)) {
      return res.status(403).json({ mensaje: 'Solo el usuario que creo este antecedente puede eliminarlo' });
    }

    await pool.query('delete from paciente_antecedente where id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { listar, crear, actualizar, eliminar };
