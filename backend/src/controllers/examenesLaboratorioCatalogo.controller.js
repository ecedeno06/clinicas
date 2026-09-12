const { pool } = require('../config/db');

// Catalogo hibrido: mismo criterio que categoriasExamenesLaboratorio.
// Un examen "propio" de una clinica puede vivir bajo una categoria
// global o bajo una categoria propia de esa misma clinica -- nunca bajo
// una categoria de otra clinica (se valida en crear/actualizar).

async function categoriaVisible(empresaIdCategoria, empresaIdUsuario) {
  return empresaIdCategoria === null || empresaIdCategoria === empresaIdUsuario;
}

async function listar(req, res, next) {
  try {
    const { categoria_id } = req.query;
    const params = [req.empresaId];
    let where = 'where (e.empresa_id is null or e.empresa_id = $1)';
    if (categoria_id) {
      params.push(categoria_id);
      where += ` and e.categoria_id = $${params.length}`;
    }
    const { rows } = await pool.query(
      `select e.*, c.nombre as categoria_nombre, emp.nombre as empresa_nombre
       from examenes_laboratorio_catalogo e
       join categorias_examenes_laboratorio c on c.id = e.categoria_id
       left join empresas emp on emp.id = e.empresa_id
       ${where}
       order by c.nombre asc, e.nombre asc`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function crear(req, res, next) {
  try {
    const { categoria_id, nombre, valor_referencia, unidad, activo } = req.body;
    if (!categoria_id || !nombre) return res.status(400).json({ mensaje: 'categoria_id y nombre son requeridos' });

    const cat = await pool.query('select empresa_id from categorias_examenes_laboratorio where id = $1', [categoria_id]);
    if (!cat.rows[0]) return res.status(400).json({ mensaje: 'La categoria indicada no existe.' });
    if (!(await categoriaVisible(cat.rows[0].empresa_id, req.empresaId))) {
      return res.status(403).json({ mensaje: 'No puedes agregar examenes a una categoria de otra clinica.' });
    }

    // Solo un super admin puede crear un examen GLOBAL; cualquier otro
    // caso queda marcado con la clinica activa del usuario.
    const empresaId = (req.usuario.es_super_admin && req.body.global) ? null : req.empresaId;
    const { rows } = await pool.query(
      `insert into examenes_laboratorio_catalogo (categoria_id, nombre, valor_referencia, unidad, empresa_id, activo)
       values ($1,$2,$3,$4,$5, coalesce($6, true)) returning *`,
      [categoria_id, nombre, valor_referencia, unidad, empresaId, activo]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ mensaje: 'Ya existe ese examen en esta categoria.' });
    if (err.code === '23503') return res.status(400).json({ mensaje: 'La categoria indicada no existe.' });
    next(err);
  }
}

async function verificarPermiso(req, id) {
  const { rows } = await pool.query('select empresa_id from examenes_laboratorio_catalogo where id = $1', [id]);
  if (!rows[0]) return { encontrado: false };
  const empresaId = rows[0].empresa_id;
  if (empresaId === null) return { encontrado: true, permitido: !!req.usuario.es_super_admin, motivo: 'Este examen es global, solo un super administrador puede modificarlo.' };
  if (empresaId !== req.empresaId) return { encontrado: true, permitido: false, motivo: 'Este examen pertenece a otra clinica.' };
  return { encontrado: true, permitido: true };
}

async function actualizar(req, res, next) {
  try {
    const chequeo = await verificarPermiso(req, req.params.id);
    if (!chequeo.encontrado) return res.status(404).json({ mensaje: 'Examen no encontrado' });
    if (!chequeo.permitido) return res.status(403).json({ mensaje: chequeo.motivo });

    const { categoria_id, nombre, valor_referencia, unidad, activo } = req.body;
    if (categoria_id) {
      const cat = await pool.query('select empresa_id from categorias_examenes_laboratorio where id = $1', [categoria_id]);
      if (!cat.rows[0]) return res.status(400).json({ mensaje: 'La categoria indicada no existe.' });
      if (!(await categoriaVisible(cat.rows[0].empresa_id, req.empresaId))) {
        return res.status(403).json({ mensaje: 'No puedes mover el examen a una categoria de otra clinica.' });
      }
    }

    const { rows } = await pool.query(
      `update examenes_laboratorio_catalogo set
         categoria_id = coalesce($1, categoria_id),
         nombre = coalesce($2, nombre),
         valor_referencia = $3,
         unidad = $4,
         activo = coalesce($5, activo)
       where id = $6 returning *`,
      [categoria_id, nombre, valor_referencia, unidad, activo, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ mensaje: 'Ya existe ese examen en esta categoria.' });
    if (err.code === '23503') return res.status(400).json({ mensaje: 'La categoria indicada no existe.' });
    next(err);
  }
}

async function eliminar(req, res, next) {
  try {
    const chequeo = await verificarPermiso(req, req.params.id);
    if (!chequeo.encontrado) return res.status(404).json({ mensaje: 'Examen no encontrado' });
    if (!chequeo.permitido) return res.status(403).json({ mensaje: chequeo.motivo });

    const { rowCount } = await pool.query('delete from examenes_laboratorio_catalogo where id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ mensaje: 'Examen no encontrado' });
    res.status(204).send();
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ mensaje: 'No se puede eliminar: esta en uso en una o mas ordenes de laboratorio.' });
    next(err);
  }
}

module.exports = { listar, crear, actualizar, eliminar };
