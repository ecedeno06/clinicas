const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

// GET /api/usuarios  -> usuarios de la clinica activa, con su rol
async function listar(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select u.id, u.nombre, u.email, u.activo, u.avatar, u.es_super_admin,
              uer.rol, u.created_at
       from usuarios u
       join usuarios_empresas_rol uer on uer.usuario_id = u.id
       where uer.empresa_id = $1
       order by u.nombre`,
      [req.empresaId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function obtener(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select u.id, u.nombre, u.email, u.activo, u.avatar, u.es_super_admin,
              uer.rol, u.created_at
       from usuarios u
       join usuarios_empresas_rol uer on uer.usuario_id = u.id
       where u.id = $1 and uer.empresa_id = $2`,
      [req.params.id, req.empresaId]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Usuario no encontrado en esta clinica' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

// GET /api/usuarios/buscar?email=...
async function buscarPorEmail(req, res, next) {
  try {
    const email = (req.query.email || '').trim();
    if (!email) return res.status(400).json({ mensaje: 'email es requerido' });

    const { rows } = await pool.query('select nombre from usuarios where email = $1', [email]);
    if (!rows[0]) return res.json({ existe: false });
    res.json({ existe: true, nombre: rows[0].nombre });
  } catch (err) { next(err); }
}

// POST /api/usuarios  { nombre, email, password, rol, activo, empresa_id? }
async function crear(req, res, next) {
  try {
    const { nombre, email, password, rol, activo, empresa_id } = req.body;
    if (!email) return res.status(400).json({ mensaje: 'email es requerido' });

    let empresaDestino = req.empresaId;
    if (req.usuario.es_super_admin && empresa_id) {
      const empresa = await pool.query('select id from empresas where id = $1 and activo = true', [empresa_id]);
      if (!empresa.rows[0]) return res.status(400).json({ mensaje: 'La clinica indicada no existe o esta inactiva' });
      empresaDestino = empresa_id;
    }

    const existente = await pool.query('select id from usuarios where email = $1', [email]);
    let usuarioId;

    if (existente.rows[0]) {
      usuarioId = existente.rows[0].id;
    } else {
      if (!nombre || !password) {
        return res.status(400).json({ mensaje: 'nombre y password son requeridos para un usuario nuevo' });
      }
      const password_hash = await bcrypt.hash(password, 10);
      const { rows } = await pool.query(
        `insert into usuarios (nombre, email, password_hash, activo)
         values ($1,$2,$3, coalesce($4, true)) returning id`,
        [nombre, email, password_hash, activo]
      );
      usuarioId = rows[0].id;
    }

    const { rows: relacion } = await pool.query(
      `insert into usuarios_empresas_rol (usuario_id, empresa_id, rol)
       values ($1, $2, coalesce($3, 'recepcionista'))
       on conflict (usuario_id, empresa_id) do update set rol = excluded.rol
       returning rol`,
      [usuarioId, empresaDestino, rol]
    );

    const { rows: usuarioRows } = await pool.query(
      'select id, nombre, email, activo, avatar, es_super_admin, created_at from usuarios where id = $1',
      [usuarioId]
    );

    res.status(201).json({ ...usuarioRows[0], rol: relacion[0].rol });
  } catch (err) { next(err); }
}

// PUT /api/usuarios/:id  { nombre, password, avatar, activo, rol }
async function actualizar(req, res, next) {
  try {
    const { nombre, password, avatar, activo, rol } = req.body;

    const pertenece = await pool.query(
      'select 1 from usuarios_empresas_rol where usuario_id = $1 and empresa_id = $2',
      [req.params.id, req.empresaId]
    );
    if (!pertenece.rows[0]) return res.status(404).json({ mensaje: 'Usuario no encontrado en esta clinica' });

    const password_hash = password ? await bcrypt.hash(password, 10) : null;
    await pool.query(
      `update usuarios set
         nombre = coalesce($1, nombre),
         avatar = coalesce($2, avatar),
         activo = coalesce($3, activo),
         password_hash = coalesce($4, password_hash)
       where id = $5`,
      [nombre, avatar, activo, password_hash, req.params.id]
    );

    if (rol) {
      await pool.query(
        'update usuarios_empresas_rol set rol = $1 where usuario_id = $2 and empresa_id = $3',
        [rol, req.params.id, req.empresaId]
      );
    }

    const { rows } = await pool.query(
      `select u.id, u.nombre, u.email, u.activo, u.avatar, u.es_super_admin, uer.rol, u.created_at
       from usuarios u
       join usuarios_empresas_rol uer on uer.usuario_id = u.id
       where u.id = $1 and uer.empresa_id = $2`,
      [req.params.id, req.empresaId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
}

// DELETE /api/usuarios/:id  -> quita al usuario de la clinica activa
async function eliminar(req, res, next) {
  try {
    const { rowCount } = await pool.query(
      'delete from usuarios_empresas_rol where usuario_id = $1 and empresa_id = $2',
      [req.params.id, req.empresaId]
    );
    if (!rowCount) return res.status(404).json({ mensaje: 'Usuario no encontrado en esta clinica' });
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { listar, obtener, crear, actualizar, eliminar, buscarPorEmail };
