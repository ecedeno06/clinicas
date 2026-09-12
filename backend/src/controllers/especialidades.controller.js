const { pool } = require('../config/db');

// Catalogo hibrido: empresa_id nulo = global (solo super admin
// crea/edita/elimina el catalogo en si); empresa_id no nulo = especialidad
// PRIVADA legado de esa clinica (creadas antes de este cambio, se
// editan/eliminan directo, sin pasar por especialidades_empresas).
//
// De ahora en adelante, "agregar una especialidad" para una clinica ya
// no crea un nombre nuevo: se ACTIVA una especialidad existente del
// catalogo global via especialidades_empresas (mismo patron que
// doctores_empresas). listar() devuelve la union de ambos mundos --
// mismo shape (Especialidad[]) que usan tambien Citas/Doctores, sin
// cambios en esos consumidores.

async function listar(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select e.id, e.nombre, e.descripcion, e.empresa_id, e.activo, e.created_at
       from especialidades e
       where e.empresa_id = $1
       union all
       select e.id, e.nombre, e.descripcion, e.empresa_id, ee.activo, e.created_at
       from especialidades e
       join especialidades_empresas ee on ee.especialidad_id = e.id
       where ee.empresa_id = $1 and e.empresa_id is null
       order by nombre asc`,
      [req.empresaId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// GET /api/especialidades/globales -- todo el catalogo global (activo),
// para poblar el selector de "que especialidad quiero activar".
async function listarCatalogoGlobal(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select * from especialidades where empresa_id is null and activo = true order by nombre asc`
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
    // Flujo 1: super admin crea una especialidad nueva en el catalogo
    // GLOBAL (accion separada del "activar", ver especialidades.component.ts).
    if (req.usuario.es_super_admin && req.body.global) {
      const { nombre, descripcion, activo } = req.body;
      const { rows } = await pool.query(
        `insert into especialidades (empresa_id, nombre, descripcion, activo)
         values (null,$1,$2, coalesce($3, true)) returning *`,
        [nombre, descripcion, activo]
      );
      return res.status(201).json(rows[0]);
    }

    // Flujo 2 (normal): activar una especialidad EXISTENTE del catalogo
    // global para esta clinica -- ya no se crea un nombre nuevo privado.
    const { especialidad_id, activo } = req.body;
    if (!especialidad_id) return res.status(400).json({ mensaje: 'especialidad_id es requerido' });

    const esp = await pool.query('select 1 from especialidades where id = $1 and empresa_id is null', [especialidad_id]);
    if (!esp.rows[0]) return res.status(400).json({ mensaje: 'La especialidad indicada no existe en el catalogo global' });

    const { rows } = await pool.query(
      `insert into especialidades_empresas (especialidad_id, empresa_id, activo)
       values ($1,$2, coalesce($3, true)) returning *`,
      [especialidad_id, req.empresaId, activo]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ mensaje: 'Ya tienes esta especialidad activada.' });
    next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const actual = await pool.query('select empresa_id from especialidades where id = $1', [req.params.id]);
    if (!actual.rows[0]) return res.status(404).json({ mensaje: 'Especialidad no encontrada' });
    const empresaId = actual.rows[0].empresa_id;

    if (empresaId === null) {
      // Global: solo un super admin puede renombrar/editar el catalogo
      // de raiz -- un admin normal no puede editar algo global (solo
      // activarlo/quitarlo, ver crear/eliminar).
      if (!req.usuario.es_super_admin) {
        return res.status(403).json({ mensaje: 'Esta especialidad es global, solo un super administrador puede modificarla.' });
      }
      const { nombre, descripcion, activo } = req.body;
      const { rows } = await pool.query(
        `update especialidades set
           nombre = coalesce($1, nombre),
           descripcion = coalesce($2, descripcion),
           activo = coalesce($3, activo)
         where id = $4 returning *`,
        [nombre, descripcion, activo, req.params.id]
      );
      return res.json(rows[0]);
    }

    // Privada legado: mismo comportamiento de siempre.
    if (empresaId !== req.empresaId) {
      return res.status(403).json({ mensaje: 'Esta especialidad pertenece a otra clinica.' });
    }
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
    const actual = await pool.query('select empresa_id from especialidades where id = $1', [req.params.id]);
    if (!actual.rows[0]) return res.status(404).json({ mensaje: 'Especialidad no encontrada' });
    const empresaId = actual.rows[0].empresa_id;

    if (empresaId === null) {
      if (req.usuario.es_super_admin) {
        // Borra la especialidad global de raiz (cascada a
        // especialidades_empresas y doctor_especialidades).
        await pool.query('delete from especialidades where id = $1', [req.params.id]);
        return res.status(204).send();
      }
      // Admin normal: solo quita SU activacion, el catalogo global
      // sigue intacto para las demas clinicas.
      const { rowCount } = await pool.query(
        'delete from especialidades_empresas where especialidad_id = $1 and empresa_id = $2',
        [req.params.id, req.empresaId]
      );
      if (!rowCount) return res.status(404).json({ mensaje: 'Especialidad no encontrada' });
      return res.status(204).send();
    }

    // Privada legado: mismo comportamiento de siempre.
    if (empresaId !== req.empresaId) {
      return res.status(403).json({ mensaje: 'Esta especialidad pertenece a otra clinica.' });
    }
    const { rowCount } = await pool.query('delete from especialidades where id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ mensaje: 'Especialidad no encontrada' });
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { listar, listarCatalogoGlobal, obtener, crear, actualizar, eliminar };
