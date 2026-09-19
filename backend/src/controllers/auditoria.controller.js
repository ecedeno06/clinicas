const { pool } = require('../config/db');

// GET /api/auditoria/sesiones?desde=&hasta=&usuario_id= (solo super-admin,
// ver requireSuperAdmin en las rutas). La tabla sesiones es global (no
// tiene requireEmpresa, ver empresas.routes.js), asi que este es el unico
// lugar del sistema donde se puede revisar el historial de acceso de
// TODAS las clinicas a la vez.
//
// Como no existe un job que cierre sesiones cuando el refresh token
// simplemente expira sin que el usuario haga logout explicito (nunca se
// setea activo=false en ese caso), se calculan 3 situaciones posibles en
// vez de confiar solo en las columnas guardadas:
//   1) activo = false            -> ya se cerro, se usan razon_salida/duracion_segundos tal cual.
//   2) activo = true, sin expirar -> sesion todavia en curso.
//   3) activo = true, expirada   -> quedo abandonada (nadie hizo logout) antes de que el token venciera.
async function listarSesiones(req, res, next) {
  try {
    const { desde, hasta, usuario_id } = req.query;
    const condiciones = [];
    const valores = [];
    if (desde) { valores.push(desde); condiciones.push(`s.created_at::date >= $${valores.length}`); }
    if (hasta) { valores.push(hasta); condiciones.push(`s.created_at::date <= $${valores.length}`); }
    if (usuario_id) { valores.push(usuario_id); condiciones.push(`s.usuario_id = $${valores.length}`); }
    const where = condiciones.length ? `where ${condiciones.join(' and ')}` : '';

    const { rows } = await pool.query(
      `select s.id, s.usuario_id, u.nombre as usuario_nombre, u.email as usuario_email,
              s.empresa_nombre, s.sucursal_nombre, s.rol,
              s.created_at as login_en,
              s.activo,
              (case when s.activo = false then s.updated_at end) as logout_en,
              (case
                when s.activo = false then s.duracion_segundos
                when s.expira_en <= now() then extract(epoch from (s.expira_en - s.created_at))::integer
                else extract(epoch from (now() - s.created_at))::integer
              end) as duracion_segundos,
              (case
                when s.activo = false then coalesce(s.razon_salida, 'logout_usuario')
                when s.expira_en <= now() then 'expirada_sin_cerrar'
                else 'en_curso'
              end) as motivo_salida
       from sesiones s
       join usuarios u on u.id = s.usuario_id
       ${where}
       order by s.created_at desc`,
      valores
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// POST /api/auditoria/sesiones/cerrar { ids: string[] } (solo super-admin)
// -- cierra a la fuerza las sesiones indicadas ("matar sesion" desde la
// pantalla de Auditoria). Solo tiene efecto real sobre sesiones "en
// curso" (activo=true, sin expirar todavia): una ya cerrada o ya
// expirada no cambia nada (el `and activo = true` la deja fuera), asi
// que es seguro mandar cualquier seleccion sin filtrarla antes.
async function cerrarSesiones(req, res, next) {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ mensaje: 'Debes indicar al menos una sesion' });
    }
    const { rows } = await pool.query(
      `update sesiones set activo = false, razon_salida = 'cerrada_por_admin',
         duracion_segundos = extract(epoch from (now() - created_at))::integer
       where id = any($1::uuid[]) and activo = true
       returning id`,
      [ids]
    );
    res.json({ cerradas: rows.length });
  } catch (err) { next(err); }
}

module.exports = { listarSesiones, cerrarSesiones };
