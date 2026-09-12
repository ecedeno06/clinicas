const { pool } = require('../config/db');

// Catalogo hibrido: empresa_id nulo = global (solo super admin
// crea/edita/elimina; es la unica que se puede asignar a un doctor, ver
// doctores.controller.js#validarEspecialidades); empresa_id no nulo =
// propio de esa clinica (solo esa clinica, o un super admin, puede
// crear/editar/eliminar) -- mismo criterio que
// categoriasExamenesLaboratorio.controller.js.

async function listar(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select e.*, emp.nombre as empresa_nombre
       from especialidades e
       left join empresas emp on emp.id = e.empresa_id
       where e.empresa_id is null or e.empresa_id = $1
       order by e.nombre asc`,
      [req.empresaId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function obtener(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select e.*, emp.nombre as empresa_nombre
       from especialidades e
       left join empresas emp on emp.id = e.empresa_id
       where e.id = $1 and (e.empresa_id is null or e.empresa_id = $2)`,
      [req.params.id, req.empresaId]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Especialidad no encontrada' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function crear(req, res, next) {
  try {
    const { nombre, descripcion, activo } = req.body;
    // Solo un super admin puede crear una especialidad GLOBAL; cualquier
    // otro caso queda marcada con la clinica activa del usuario, sin
    // importar lo que envie el cliente.
    const empresaId = (req.usuario.es_super_admin && req.body.global) ? null : req.empresaId;
    const { rows } = await pool.query(
      `insert into especialidades (empresa_id, nombre, descripcion, activo)
       values ($1,$2,$3, coalesce($4, true)) returning *`,
      [empresaId, nombre, descripcion, activo]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ mensaje: 'Ya existe una especialidad con ese nombre.' });
    next(err);
  }
}

async function verificarPermiso(req, id) {
  const { rows } = await pool.query('select empresa_id from especialidades where id = $1', [id]);
  if (!rows[0]) return { encontrada: false };
  const empresaId = rows[0].empresa_id;
  if (empresaId === null) return { encontrada: true, permitido: !!req.usuario.es_super_admin, motivo: 'Esta especialidad es global, solo un super administrador puede modificarla.' };
  if (empresaId !== req.empresaId) return { encontrada: true, permitido: false, motivo: 'Esta especialidad pertenece a otra clinica.' };
  return { encontrada: true, permitido: true };
}

async function actualizar(req, res, next) {
  try {
    const chequeo = await verificarPermiso(req, req.params.id);
    if (!chequeo.encontrada) return res.status(404).json({ mensaje: 'Especialidad no encontrada' });
    if (!chequeo.permitido) return res.status(403).json({ mensaje: chequeo.motivo });

    const { nombre, descripcion, activo } = req.body;
    const { rows } = await pool.query(
      `update especialidades set
         nombre = coalesce($1, nombre),
         descripcion = coalesce($2, descripcion),
         activo = coalesce($3, activo)
       where id = $4 returning *`,
      [nombre, descripcion, activo, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ mensaje: 'Ya existe una especialidad con ese nombre.' });
    next(err);
  }
}

async function eliminar(req, res, next) {
  try {
    const chequeo = await verificarPermiso(req, req.params.id);
    if (!chequeo.encontrada) return res.status(404).json({ mensaje: 'Especialidad no encontrada' });
    if (!chequeo.permitido) return res.status(403).json({ mensaje: chequeo.motivo });

    const { rowCount } = await pool.query('delete from especialidades where id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ mensaje: 'Especialidad no encontrada' });
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { listar, obtener, crear, actualizar, eliminar };
