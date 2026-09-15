const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { obtenerPolitica, validarPassword, generarPasswordSegunPolitica } = require('../utils/politicaPassword');
const { enviarCorreo } = require('../utils/correo');

// GET /api/usuarios  -> STAFF de la clinica activa, con su rol. El rol
// 'paciente' nunca aparece aqui -- esta pantalla es de gestion de staff,
// no del portal de pacientes (ver portalPaciente.controller.js); sin este
// filtro, alguien que ademas es paciente de su propia clinica saldria
// duplicado.
async function listar(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select u.id, u.nombre, u.email, u.telefono, u.acepta_whatsapp, u.activo, u.avatar, u.es_super_admin,
              uer.rol, u.created_at
       from usuarios u
       join usuarios_empresas_rol uer on uer.usuario_id = u.id
       where uer.empresa_id = $1 and uer.rol <> 'paciente'
       order by u.nombre`,
      [req.empresaId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function obtener(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select u.id, u.nombre, u.email, u.telefono, u.acepta_whatsapp, u.activo, u.avatar, u.es_super_admin,
              uer.rol, u.created_at
       from usuarios u
       join usuarios_empresas_rol uer on uer.usuario_id = u.id
       where u.id = $1 and uer.empresa_id = $2 and uer.rol <> 'paciente'`,
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

// POST /api/usuarios  { nombre, email, password, telefono, acepta_whatsapp, rol, activo, empresa_id?, es_super_admin? }
async function crear(req, res, next) {
  try {
    const { nombre, email, password, telefono, acepta_whatsapp, rol, activo, empresa_id, es_super_admin } = req.body;
    if (!email) return res.status(400).json({ mensaje: 'email es requerido' });

    // es_super_admin es un permiso global (independiente de la clinica) --
    // solo otro super-admin puede otorgarlo, igual que solo un super-admin
    // puede elegir a que clinica va este usuario (empresa_id abajo). Un
    // admin normal que intente mandar este campo simplemente se ignora.
    const otorgarSuperAdmin = req.usuario.es_super_admin && es_super_admin === true;

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
      if (otorgarSuperAdmin) {
        await pool.query('update usuarios set es_super_admin = true where id = $1', [usuarioId]);
      }
    } else {
      if (!nombre || !password) {
        return res.status(400).json({ mensaje: 'nombre y password son requeridos para un usuario nuevo' });
      }
      const erroresPassword = validarPassword(password, await obtenerPolitica());
      if (erroresPassword.length) return res.status(400).json({ mensaje: erroresPassword.join('. ') });
      const password_hash = await bcrypt.hash(password, 10);
      const { rows } = await pool.query(
        `insert into usuarios (nombre, email, password_hash, telefono, acepta_whatsapp, activo, debe_cambiar_password, es_super_admin)
         values ($1,$2,$3,$4, coalesce($5, false), coalesce($6, true), true, $7) returning id`,
        [nombre, email, password_hash, telefono, acepta_whatsapp, activo, otorgarSuperAdmin]
      );
      usuarioId = rows[0].id;
    }

    // El rol aqui siempre es de staff (el <select> del formulario solo
    // ofrece admin/doctor/recepcionista, nunca 'paciente'). Una cuenta
    // puede tener MAS de un rol de staff en la misma clinica (ej. admin Y
    // doctor -- ver uq_usuarios_empresas_rol_staff, incluye "rol" en la
    // clave unica) -- por eso ya no se hace upsert reemplazando el rol
    // anterior: si ya tenia ESE rol especifico no se duplica (on conflict
    // do nothing), si tenia uno distinto ahora simplemente se suma.
    const rolFinal = rol || 'recepcionista';
    await pool.query(
      `insert into usuarios_empresas_rol (usuario_id, empresa_id, rol)
       values ($1, $2, $3)
       on conflict (usuario_id, empresa_id, rol) where rol <> 'paciente' do nothing`,
      [usuarioId, empresaDestino, rolFinal]
    );

    const { rows: usuarioRows } = await pool.query(
      'select id, nombre, email, telefono, acepta_whatsapp, activo, avatar, es_super_admin, created_at from usuarios where id = $1',
      [usuarioId]
    );

    res.status(201).json({ ...usuarioRows[0], rol: rolFinal });
  } catch (err) { next(err); }
}

// PUT /api/usuarios/:id  { nombre, password, avatar, telefono, acepta_whatsapp, activo, rol, rol_actual?, es_super_admin? }
// rol_actual: cual de sus roles de staff en esta clinica se esta
// editando -- solo hace falta si el usuario tiene mas de uno (ver
// uq_usuarios_empresas_rol_staff, ahora permite admin+doctor a la vez).
async function actualizar(req, res, next) {
  try {
    const { nombre, password, avatar, telefono, acepta_whatsapp, activo, rol, rol_actual, es_super_admin } = req.body;

    const pertenece = await pool.query(
      "select 1 from usuarios_empresas_rol where usuario_id = $1 and empresa_id = $2 and rol <> 'paciente'",
      [req.params.id, req.empresaId]
    );
    if (!pertenece.rows[0]) return res.status(404).json({ mensaje: 'Usuario no encontrado en esta clinica' });

    if (password) {
      const erroresPassword = validarPassword(password, await obtenerPolitica());
      if (erroresPassword.length) return res.status(400).json({ mensaje: erroresPassword.join('. ') });
    }
    const password_hash = password ? await bcrypt.hash(password, 10) : null;
    // es_super_admin es un permiso global -- solo otro super-admin puede
    // otorgarlo o quitarlo; un admin normal que lo mande se ignora
    // silenciosamente (coalesce deja el valor actual sin tocar).
    const nuevoSuperAdmin = req.usuario.es_super_admin && es_super_admin !== undefined ? es_super_admin : null;
    // Si un admin le pone una contrasena nueva a otro usuario (reset), esa
    // contrasena es temporal -- la conoce el admin, no la eligio el
    // usuario, asi que se le exige cambiarla en su siguiente login.
    await pool.query(
      `update usuarios set
         nombre = coalesce($1, nombre),
         avatar = coalesce($2, avatar),
         telefono = coalesce($3, telefono),
         acepta_whatsapp = coalesce($4, acepta_whatsapp),
         activo = coalesce($5, activo),
         password_hash = coalesce($6, password_hash),
         debe_cambiar_password = case when $6::text is not null then true else debe_cambiar_password end,
         es_super_admin = coalesce($8, es_super_admin)
       where id = $7`,
      [nombre, avatar, telefono, acepta_whatsapp, activo, password_hash, req.params.id, nuevoSuperAdmin]
    );

    if (rol) {
      // Si tiene mas de un rol de staff aca (ej. admin Y doctor), hace
      // falta saber cual de los dos se esta editando -- sin eso, un
      // update "a ciegas" cambiaria AMBAS filas al mismo rol nuevo y
      // chocaria contra la restriccion unica (dos filas identicas).
      const filasStaff = await pool.query(
        "select rol from usuarios_empresas_rol where usuario_id = $1 and empresa_id = $2 and rol <> 'paciente'",
        [req.params.id, req.empresaId]
      );
      if (filasStaff.rows.length > 1 && !rol_actual) {
        return res.status(400).json({ mensaje: 'Este usuario tiene mas de un rol de staff en esta clinica -- especifica cual rol estas editando (rol_actual).' });
      }
      const rolObjetivo = rol_actual || filasStaff.rows[0]?.rol;
      if (rolObjetivo && rolObjetivo !== rol) {
        await pool.query(
          'update usuarios_empresas_rol set rol = $1 where usuario_id = $2 and empresa_id = $3 and rol = $4',
          [rol, req.params.id, req.empresaId, rolObjetivo]
        );
      }
    }

    // Si tiene mas de un rol de staff, se devuelve puntualmente la fila que
    // se acaba de editar (el nuevo valor de "rol") en vez de una fila
    // arbitraria entre las que tenga.
    const { rows } = await pool.query(
      `select u.id, u.nombre, u.email, u.telefono, u.acepta_whatsapp, u.activo, u.avatar, u.es_super_admin, uer.rol, u.created_at
       from usuarios u
       join usuarios_empresas_rol uer on uer.usuario_id = u.id
       where u.id = $1 and uer.empresa_id = $2 and uer.rol <> 'paciente' ${rol ? 'and uer.rol = $3' : ''}`,
      rol ? [req.params.id, req.empresaId, rol] : [req.params.id, req.empresaId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
}

// DELETE /api/usuarios/:id?rol=admin -> quita al usuario del STAFF de la
// clinica activa. Si ademas es paciente de esta clinica, ese acceso NO se
// toca (son cosas independientes -- dejar de trabajar ahi no le quita su
// portal de paciente). ?rol= indica cual rol de staff quitar -- solo hace
// falta si tiene mas de uno (ej. admin Y doctor); sin eso se quitarian
// TODOS sus roles de staff de un tiron.
async function eliminar(req, res, next) {
  try {
    const rolAQuitar = req.query.rol;
    const filasStaff = await pool.query(
      "select rol from usuarios_empresas_rol where usuario_id = $1 and empresa_id = $2 and rol <> 'paciente'",
      [req.params.id, req.empresaId]
    );
    if (filasStaff.rows.length > 1 && !rolAQuitar) {
      return res.status(400).json({ mensaje: 'Este usuario tiene mas de un rol de staff en esta clinica -- especifica cual rol estas quitando (?rol=).' });
    }

    const condicion = rolAQuitar ? 'and rol = $3' : "and rol <> 'paciente'";
    const valores = rolAQuitar ? [req.params.id, req.empresaId, rolAQuitar] : [req.params.id, req.empresaId];
    const { rowCount } = await pool.query(
      `delete from usuarios_empresas_rol where usuario_id = $1 and empresa_id = $2 ${condicion}`,
      valores
    );
    if (!rowCount) return res.status(404).json({ mensaje: 'Usuario no encontrado en esta clinica' });
    res.status(204).send();
  } catch (err) { next(err); }
}

// POST /api/usuarios/:id/resetear-password -- genera un password nuevo
// (segun la politica activa, no solo el minimo) y lo envia por correo al
// usuario; nunca se devuelve en la respuesta. El correo se envia ANTES
// de guardar el cambio: si el envio falla, la contrasena actual no se
// toca (evita dejar al usuario sin acceso y sin saber la clave nueva).
async function resetearPassword(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select u.id, u.nombre, u.email from usuarios u
       join usuarios_empresas_rol uer on uer.usuario_id = u.id
       where u.id = $1 and uer.empresa_id = $2 and uer.rol <> 'paciente'`,
      [req.params.id, req.empresaId]
    );
    const usuario = rows[0];
    if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado en esta clinica' });

    const politica = await obtenerPolitica();
    const passwordTemporal = generarPasswordSegunPolitica(politica);
    const password_hash = await bcrypt.hash(passwordTemporal, 10);

    const empresaRes = await pool.query('select nombre from empresas where id = $1', [req.empresaId]);
    const empresaNombre = empresaRes.rows[0]?.nombre || 'la clinica';
    const enlace = `${process.env.CORS_ORIGIN || 'http://localhost:4201'}/login`;

    try {
      await enviarCorreo({
        destinatario: usuario.email,
        asunto: `Tu contrasena fue restablecida - ${empresaNombre}`,
        texto: `Hola ${usuario.nombre},\n\nUn administrador de ${empresaNombre} restablecio tu contrasena.\n\nUsuario: ${usuario.email}\nContrasena temporal: ${passwordTemporal}\n\nIngresa aqui: ${enlace}\n\nPor seguridad, se te pedira cambiar esta contrasena la primera vez que inicies sesion.`,
      });
    } catch (err) {
      return res.status(502).json({ mensaje: 'No se pudo enviar el correo con la nueva contrasena. Intenta de nuevo.' });
    }

    await pool.query(
      'update usuarios set password_hash = $1, debe_cambiar_password = true where id = $2',
      [password_hash, usuario.id]
    );

    res.json({ mensaje: `Se envio una nueva contrasena al correo ${usuario.email}` });
  } catch (err) { next(err); }
}

module.exports = { listar, obtener, crear, actualizar, eliminar, buscarPorEmail, resetearPassword };
