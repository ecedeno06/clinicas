const { pool } = require('../config/db');

async function listar(req, res, next) {
  try {
    const { rows } = await pool.query('select * from empresas where activo = true order by nombre');
    res.json(rows);
  } catch (err) { next(err); }
}

async function obtener(req, res, next) {
  try {
    const { rows } = await pool.query('select * from empresas where id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ mensaje: 'Clinica no encontrada' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function crear(req, res, next) {
  try {
    const { nombre, identificacion, email, telefono, direccion, logo, activo } = req.body;
    const { rows } = await pool.query(
      `insert into empresas (nombre, identificacion, email, telefono, direccion, logo, activo)
       values ($1,$2,$3,$4,$5,$6, coalesce($7, true)) returning *`,
      [nombre, identificacion, email, telefono, direccion, logo, activo]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function actualizar(req, res, next) {
  try {
    const { nombre, identificacion, email, telefono, direccion, logo, activo } = req.body;
    const { rows } = await pool.query(
      `update empresas set
         nombre = coalesce($1, nombre),
         identificacion = coalesce($2, identificacion),
         email = coalesce($3, email),
         telefono = coalesce($4, telefono),
         direccion = coalesce($5, direccion),
         logo = coalesce($6, logo),
         activo = coalesce($7, activo)
       where id = $8 returning *`,
      [nombre, identificacion, email, telefono, direccion, logo, activo, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Clinica no encontrada' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function eliminar(req, res, next) {
  try {
    const { rowCount } = await pool.query('delete from empresas where id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ mensaje: 'Clinica no encontrada' });
    res.status(204).send();
  } catch (err) { next(err); }
}

// GET /api/empresas/usuarios-globales
async function listarUsuariosGlobales(req, res, next) {
  try {
    const { rows } = await pool.query('select id, nombre, email from usuarios order by nombre');
    res.json(rows);
  } catch (err) { next(err); }
}

// GET /api/empresas/:id/usuarios
async function listarUsuariosDeEmpresa(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select u.id, u.nombre, u.email, uer.rol
       from usuarios_empresas_rol uer
       join usuarios u on u.id = uer.usuario_id
       where uer.empresa_id = $1
       order by u.nombre`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// POST /api/empresas/:id/usuarios  { usuario_id, rol }
async function asociarUsuario(req, res, next) {
  try {
    const { usuario_id, rol } = req.body;
    if (!usuario_id) return res.status(400).json({ mensaje: 'usuario_id es requerido' });

    const { rows } = await pool.query(
      `insert into usuarios_empresas_rol (usuario_id, empresa_id, rol)
       values ($1, $2, coalesce($3, 'recepcionista'))
       on conflict (usuario_id, empresa_id) do update set rol = excluded.rol
       returning rol`,
      [usuario_id, req.params.id, rol]
    );

    const { rows: usuarioRows } = await pool.query('select id, nombre, email from usuarios where id = $1', [usuario_id]);
    if (!usuarioRows[0]) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    res.status(201).json({ ...usuarioRows[0], rol: rows[0].rol });
  } catch (err) { next(err); }
}

// DELETE /api/empresas/:id/usuarios/:usuarioId
async function desasociarUsuario(req, res, next) {
  try {
    const { rowCount } = await pool.query(
      'delete from usuarios_empresas_rol where usuario_id = $1 and empresa_id = $2',
      [req.params.usuarioId, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ mensaje: 'El usuario no esta asociado a esta clinica' });
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = {
  listar, obtener, crear, actualizar, eliminar,
  listarUsuariosGlobales, listarUsuariosDeEmpresa, asociarUsuario, desasociarUsuario,
};
