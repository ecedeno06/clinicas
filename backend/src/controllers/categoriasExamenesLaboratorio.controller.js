const { pool } = require('../config/db');

// Catalogo hibrido: empresa_id nulo = global (solo super admin
// crea/edita/elimina); empresa_id no nulo = propio de esa clinica (solo
// esa clinica, o un super admin, puede crear/editar/eliminar). La
// lectura siempre incluye el global + lo propio de la clinica activa del
// usuario -- ver categoriasExamenesLaboratorio.routes.js para el gateo.

async function listar(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select c.*, e.nombre as empresa_nombre
       from categorias_examenes_laboratorio c
       left join empresas e on e.id = c.empresa_id
       where c.empresa_id is null or c.empresa_id = $1
       order by c.nombre asc`,
      [req.empresaId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function crear(req, res, next) {
  try {
    const { nombre, activo } = req.body;
    if (!nombre) return res.status(400).json({ mensaje: 'nombre es requerido' });
    // Solo un super admin puede crear una categoria GLOBAL; cualquier
    // otro caso queda marcada con la clinica activa del usuario, sin
    // importar lo que envie el cliente.
    const empresaId = (req.usuario.es_super_admin && req.body.global) ? null : req.empresaId;
    const { rows } = await pool.query(
      `insert into categorias_examenes_laboratorio (nombre, empresa_id, activo)
       values ($1, $2, coalesce($3, true)) returning *`,
      [nombre, empresaId, activo]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ mensaje: 'Ya existe una categoria con ese nombre.' });
    next(err);
  }
}

async function verificarPermiso(req, id) {
  const { rows } = await pool.query('select empresa_id from categorias_examenes_laboratorio where id = $1', [id]);
  if (!rows[0]) return { encontrada: false };
  const empresaId = rows[0].empresa_id;
  if (empresaId === null) return { encontrada: true, permitido: !!req.usuario.es_super_admin, motivo: 'Esta categoria es global, solo un super administrador puede modificarla.' };
  if (empresaId !== req.empresaId) return { encontrada: true, permitido: false, motivo: 'Esta categoria pertenece a otra clinica.' };
  return { encontrada: true, permitido: true };
}

async function actualizar(req, res, next) {
  try {
    const chequeo = await verificarPermiso(req, req.params.id);
    if (!chequeo.encontrada) return res.status(404).json({ mensaje: 'Categoria no encontrada' });
    if (!chequeo.permitido) return res.status(403).json({ mensaje: chequeo.motivo });

    const { nombre, activo } = req.body;
    const { rows } = await pool.query(
      `update categorias_examenes_laboratorio set
         nombre = coalesce($1, nombre),
         activo = coalesce($2, activo)
       where id = $3 returning *`,
      [nombre, activo, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ mensaje: 'Ya existe una categoria con ese nombre.' });
    next(err);
  }
}

async function eliminar(req, res, next) {
  try {
    const chequeo = await verificarPermiso(req, req.params.id);
    if (!chequeo.encontrada) return res.status(404).json({ mensaje: 'Categoria no encontrada' });
    if (!chequeo.permitido) return res.status(403).json({ mensaje: chequeo.motivo });

    const { rowCount } = await pool.query('delete from categorias_examenes_laboratorio where id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ mensaje: 'Categoria no encontrada' });
    res.status(204).send();
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ mensaje: 'No se puede eliminar: tiene examenes registrados en esta categoria.' });
    next(err);
  }
}

module.exports = { listar, crear, actualizar, eliminar };
