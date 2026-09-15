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

// GET /api/empresas/:id/usuarios -- solo STAFF (el rol 'paciente' no
// aplica a esta pantalla de gestion de super-admin).
async function listarUsuariosDeEmpresa(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select u.id, u.nombre, u.email, uer.rol
       from usuarios_empresas_rol uer
       join usuarios u on u.id = uer.usuario_id
       where uer.empresa_id = $1 and uer.rol <> 'paciente'
       order by u.nombre`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// POST /api/empresas/:id/usuarios  { usuario_id, rol }
// Una cuenta puede tener mas de un rol de staff en la misma clinica (ej.
// admin Y doctor -- ver uq_usuarios_empresas_rol_staff, incluye "rol" en
// la clave unica): si ya tenia ESE rol especifico no se duplica (on
// conflict do nothing), si tenia uno distinto ahora se suma en vez de
// reemplazarlo.
async function asociarUsuario(req, res, next) {
  try {
    const { usuario_id, rol } = req.body;
    if (!usuario_id) return res.status(400).json({ mensaje: 'usuario_id es requerido' });

    const rolFinal = rol || 'recepcionista';
    await pool.query(
      `insert into usuarios_empresas_rol (usuario_id, empresa_id, rol)
       values ($1, $2, $3)
       on conflict (usuario_id, empresa_id, rol) where rol <> 'paciente' do nothing`,
      [usuario_id, req.params.id, rolFinal]
    );

    const { rows: usuarioRows } = await pool.query('select id, nombre, email from usuarios where id = $1', [usuario_id]);
    if (!usuarioRows[0]) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    res.status(201).json({ ...usuarioRows[0], rol: rolFinal });
  } catch (err) { next(err); }
}

// DELETE /api/empresas/:id/usuarios/:usuarioId?rol=admin -- solo la fila
// de staff indicada. ?rol= hace falta si tiene mas de un rol de staff ahi
// (ver usuarios.controller.js#eliminar, mismo criterio).
async function desasociarUsuario(req, res, next) {
  try {
    const rolAQuitar = req.query.rol;
    const filasStaff = await pool.query(
      "select rol from usuarios_empresas_rol where usuario_id = $1 and empresa_id = $2 and rol <> 'paciente'",
      [req.params.usuarioId, req.params.id]
    );
    if (filasStaff.rows.length > 1 && !rolAQuitar) {
      return res.status(400).json({ mensaje: 'Este usuario tiene mas de un rol de staff en esta clinica -- especifica cual rol estas quitando (?rol=).' });
    }

    const condicion = rolAQuitar ? 'and rol = $3' : "and rol <> 'paciente'";
    const valores = rolAQuitar ? [req.params.usuarioId, req.params.id, rolAQuitar] : [req.params.usuarioId, req.params.id];
    const { rowCount } = await pool.query(
      `delete from usuarios_empresas_rol where usuario_id = $1 and empresa_id = $2 ${condicion}`,
      valores
    );
    if (!rowCount) return res.status(404).json({ mensaje: 'El usuario no esta asociado a esta clinica' });
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = {
  listar, obtener, crear, actualizar, eliminar,
  listarUsuariosGlobales, listarUsuariosDeEmpresa, asociarUsuario, desasociarUsuario,
};
