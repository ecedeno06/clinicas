const { pool } = require('../config/db');

// Solo quien creo la receta puede editarla/eliminarla. Las recetas de
// antes de este campo (creado_por null, autor desconocido) quedan sin
// restriccion para no bloquear registros historicos.
function puedeModificar(receta, usuario) {
  return !receta.creado_por || receta.creado_por === usuario?.id;
}

async function cargarMedicamentos(recetaId) {
  const { rows } = await pool.query(
    'select * from receta_medicamentos where receta_id = $1 order by orden asc, created_at asc',
    [recetaId]
  );
  return rows;
}

// GET /api/citas/:citaId/recetas
// Una cita puede tener varias recetas (el doctor puede emitir mas de una
// en la misma consulta), asi que devuelve una lista, no un objeto unico.
async function listarPorCita(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select r.* from recetas r
       join citas c on c.id = r.cita_id
       where r.cita_id = $1 and c.empresa_id = $2
       order by r.created_at asc`,
      [req.params.citaId, req.empresaId]
    );

    const recetas = await Promise.all(
      rows.map(async (r) => ({ ...r, medicamentos: await cargarMedicamentos(r.id) }))
    );
    res.json(recetas);
  } catch (err) { next(err); }
}

// POST /api/citas/:citaId/recetas  { indicaciones_generales, medicamentos: [{ medicamento, dosis, frecuencia, duracion, indicaciones }] }
async function crear(req, res, next) {
  const client = await pool.connect();
  try {
    const cita = await client.query('select * from citas where id = $1 and empresa_id = $2', [req.params.citaId, req.empresaId]);
    if (!cita.rows[0]) return res.status(404).json({ mensaje: 'Cita no encontrada' });

    const { indicaciones_generales, medicamentos } = req.body;
    if (!Array.isArray(medicamentos) || medicamentos.length === 0) {
      return res.status(400).json({ mensaje: 'La receta debe tener al menos un medicamento' });
    }

    const c = cita.rows[0];

    await client.query('begin');
    const { rows } = await client.query(
      `insert into recetas (empresa_id, cita_id, paciente_id, doctor_id, indicaciones_generales, creado_por)
       values ($1,$2,$3,$4,$5,$6) returning *`,
      [req.empresaId, c.id, c.paciente_id, c.doctor_id, indicaciones_generales, req.usuario?.id]
    );
    const receta = rows[0];

    for (let i = 0; i < medicamentos.length; i++) {
      const m = medicamentos[i];
      await client.query(
        `insert into receta_medicamentos (receta_id, medicamento, dosis, frecuencia, duracion, indicaciones, orden)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [receta.id, m.medicamento, m.dosis, m.frecuencia, m.duracion, m.indicaciones, i]
      );
    }
    await client.query('commit');

    const medicamentosGuardados = await cargarMedicamentos(receta.id);
    res.status(201).json({ ...receta, medicamentos: medicamentosGuardados });
  } catch (err) {
    await client.query('rollback');
    next(err);
  } finally {
    client.release();
  }
}

// PUT /api/recetas/:recetaId  { indicaciones_generales, medicamentos: [...] }
// Reemplaza la lista completa de medicamentos de ESA receta puntual (no se
// editan uno a uno). Ya no se busca por cita_id porque una cita puede tener
// varias recetas.
async function actualizar(req, res, next) {
  const client = await pool.connect();
  try {
    const actual = await client.query(
      `select r.* from recetas r
       join citas c on c.id = r.cita_id
       where r.id = $1 and c.empresa_id = $2`,
      [req.params.recetaId, req.empresaId]
    );
    if (!actual.rows[0]) return res.status(404).json({ mensaje: 'Receta no encontrada' });
    if (!puedeModificar(actual.rows[0], req.usuario)) {
      return res.status(403).json({ mensaje: 'Solo el usuario que creo esta receta puede editarla' });
    }

    const { indicaciones_generales, medicamentos } = req.body;
    if (!Array.isArray(medicamentos) || medicamentos.length === 0) {
      return res.status(400).json({ mensaje: 'La receta debe tener al menos un medicamento' });
    }

    const receta = actual.rows[0];

    await client.query('begin');
    await client.query(
      `update recetas set indicaciones_generales = coalesce($1, indicaciones_generales) where id = $2`,
      [indicaciones_generales, receta.id]
    );
    await client.query('delete from receta_medicamentos where receta_id = $1', [receta.id]);
    for (let i = 0; i < medicamentos.length; i++) {
      const m = medicamentos[i];
      await client.query(
        `insert into receta_medicamentos (receta_id, medicamento, dosis, frecuencia, duracion, indicaciones, orden)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [receta.id, m.medicamento, m.dosis, m.frecuencia, m.duracion, m.indicaciones, i]
      );
    }
    await client.query('commit');

    const { rows } = await client.query('select * from recetas where id = $1', [receta.id]);
    const medicamentosGuardados = await cargarMedicamentos(receta.id);
    res.json({ ...rows[0], medicamentos: medicamentosGuardados });
  } catch (err) {
    await client.query('rollback');
    next(err);
  } finally {
    client.release();
  }
}

// DELETE /api/recetas/:recetaId
async function eliminar(req, res, next) {
  try {
    const actual = await pool.query(
      `select r.* from recetas r
       join citas c on c.id = r.cita_id
       where r.id = $1 and c.empresa_id = $2`,
      [req.params.recetaId, req.empresaId]
    );
    if (!actual.rows[0]) return res.status(404).json({ mensaje: 'Receta no encontrada' });
    if (!puedeModificar(actual.rows[0], req.usuario)) {
      return res.status(403).json({ mensaje: 'Solo el usuario que creo esta receta puede eliminarla' });
    }

    const { rowCount } = await pool.query('delete from recetas where id = $1', [req.params.recetaId]);
    if (!rowCount) return res.status(404).json({ mensaje: 'Receta no encontrada' });
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { listarPorCita, crear, actualizar, eliminar };
