const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

function firmarToken(payload, expiresIn) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: expiresIn || process.env.JWT_EXPIRES_IN || '8h' });
}

// POST /api/auth/login
// Si el usuario pertenece a una sola clinica activa, entrega el JWT final
// directamente. Si pertenece a varias, entrega un token parcial + la lista
// de clinicas, y el frontend debe llamar a /auth/seleccionar-empresa.
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ mensaje: 'Email y password son requeridos' });
    }

    const { rows } = await pool.query(
      'select id, nombre, email, password_hash, activo, avatar, es_super_admin from usuarios where email = $1',
      [email]
    );
    const usuario = rows[0];

    if (!usuario || !usuario.activo) {
      return res.status(401).json({ mensaje: 'Credenciales invalidas' });
    }

    const passwordOk = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ mensaje: 'Credenciales invalidas' });
    }

    // Un super-admin elige SIEMPRE la clinica activa al iniciar sesion
    // (incluso si solo tiene una), viendo todas las clinicas del sistema.
    if (usuario.es_super_admin) {
      const { rows: todasEmpresas } = await pool.query(
        `select e.id as empresa_id, e.nombre as empresa_nombre,
                coalesce(uer.rol, 'admin') as rol
         from empresas e
         left join usuarios_empresas_rol uer
                on uer.empresa_id = e.id and uer.usuario_id = $1
         where e.activo = true
         order by e.nombre`,
        [usuario.id]
      );

      if (todasEmpresas.length === 0) {
        const payload = {
          id: usuario.id, nombre: usuario.nombre, email: usuario.email,
          rol: null, empresa_id: null, empresa_nombre: null, empresa_logo: null,
          es_super_admin: true, avatar: usuario.avatar,
        };
        const token = firmarToken({
          id: payload.id, nombre: payload.nombre, email: payload.email,
          rol: null, empresa_id: null, es_super_admin: true,
        });
        return res.json({ token, usuario: payload });
      }

      const tokenParcial = firmarToken(
        { id: usuario.id, nombre: usuario.nombre, email: usuario.email, parcial: true },
        '10m'
      );
      return res.json({
        requiereSeleccionEmpresa: true,
        tokenParcial,
        empresas: todasEmpresas.map((e) => ({ empresa_id: e.empresa_id, empresa_nombre: e.empresa_nombre, rol: e.rol })),
      });
    }

    const { rows: empresas } = await pool.query(
      `select uer.empresa_id, uer.rol, e.nombre as empresa_nombre, e.logo as empresa_logo
       from usuarios_empresas_rol uer
       join empresas e on e.id = uer.empresa_id
       where uer.usuario_id = $1 and e.activo = true
       order by e.nombre`,
      [usuario.id]
    );

    if (empresas.length === 0) {
      return res.status(401).json({ mensaje: 'El usuario no tiene ninguna clinica asignada' });
    }

    if (empresas.length > 1) {
      const tokenParcial = firmarToken(
        { id: usuario.id, nombre: usuario.nombre, email: usuario.email, parcial: true },
        '10m'
      );
      return res.json({
        requiereSeleccionEmpresa: true,
        tokenParcial,
        empresas: empresas.map((e) => ({ empresa_id: e.empresa_id, empresa_nombre: e.empresa_nombre, rol: e.rol })),
      });
    }

    const empresaActiva = empresas[0];
    const payload = {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: empresaActiva ? empresaActiva.rol : null,
      empresa_id: empresaActiva ? empresaActiva.empresa_id : null,
      empresa_nombre: empresaActiva ? empresaActiva.empresa_nombre : null,
      empresa_logo: empresaActiva ? empresaActiva.empresa_logo : null,
      es_super_admin: usuario.es_super_admin,
      avatar: usuario.avatar,
    };
    const token = firmarToken({
      id: payload.id,
      nombre: payload.nombre,
      email: payload.email,
      rol: payload.rol,
      empresa_id: payload.empresa_id,
      es_super_admin: payload.es_super_admin,
    });

    res.json({ token, usuario: payload });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/seleccionar-empresa  { empresa_id }
async function seleccionarEmpresa(req, res, next) {
  try {
    if (!req.usuario.parcial) {
      return res.status(403).json({ mensaje: 'Para cambiar de clinica activa cierra sesion y vuelve a entrar.' });
    }

    const { empresa_id } = req.body;
    if (!empresa_id) return res.status(400).json({ mensaje: 'empresa_id es requerido' });

    const { rows: usuarioRows } = await pool.query(
      'select id, nombre, email, avatar, es_super_admin from usuarios where id = $1',
      [req.usuario.id]
    );
    const usuario = usuarioRows[0];

    const { rows: relacion } = await pool.query(
      `select uer.rol, e.nombre as empresa_nombre, e.logo as empresa_logo
       from usuarios_empresas_rol uer
       join empresas e on e.id = uer.empresa_id
       where uer.usuario_id = $1 and uer.empresa_id = $2 and e.activo = true`,
      [req.usuario.id, empresa_id]
    );

    let rol, empresaNombre, empresaLogo;
    if (relacion[0]) {
      rol = relacion[0].rol;
      empresaNombre = relacion[0].empresa_nombre;
      empresaLogo = relacion[0].empresa_logo;
    } else if (usuario.es_super_admin) {
      const { rows: empresaRows } = await pool.query('select nombre, logo from empresas where id = $1 and activo = true', [empresa_id]);
      if (!empresaRows[0]) return res.status(404).json({ mensaje: 'Clinica no encontrada' });
      rol = 'admin';
      empresaNombre = empresaRows[0].nombre;
      empresaLogo = empresaRows[0].logo;
    } else {
      return res.status(403).json({ mensaje: 'No tienes acceso a esa clinica' });
    }

    const payload = {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol,
      empresa_id,
      empresa_nombre: empresaNombre,
      empresa_logo: empresaLogo,
      es_super_admin: usuario.es_super_admin,
      avatar: usuario.avatar,
    };
    const token = firmarToken({
      id: payload.id,
      nombre: payload.nombre,
      email: payload.email,
      rol: payload.rol,
      empresa_id: payload.empresa_id,
      es_super_admin: payload.es_super_admin,
    });

    res.json({ token, usuario: payload });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/mis-empresas
async function misEmpresas(req, res, next) {
  try {
    if (req.usuario.es_super_admin) {
      const { rows } = await pool.query(
        `select e.id as empresa_id, e.nombre as empresa_nombre,
                coalesce(uer.rol, 'admin') as rol
         from empresas e
         left join usuarios_empresas_rol uer
                on uer.empresa_id = e.id and uer.usuario_id = $1
         where e.activo = true
         order by e.nombre`,
        [req.usuario.id]
      );
      return res.json(rows);
    }

    const { rows } = await pool.query(
      `select e.id as empresa_id, e.nombre as empresa_nombre, uer.rol
       from usuarios_empresas_rol uer
       join empresas e on e.id = uer.empresa_id
       where uer.usuario_id = $1 and e.activo = true
       order by e.nombre`,
      [req.usuario.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/me
async function me(req, res, next) {
  try {
    const { rows } = await pool.query(
      'select id, nombre, email, activo, avatar, es_super_admin, created_at from usuarios where id = $1',
      [req.usuario.id]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    res.json({ ...rows[0], rol: req.usuario.rol, empresa_id: req.usuario.empresa_id, empresa_nombre: req.usuario.empresa_nombre });
  } catch (err) {
    next(err);
  }
}

// PUT /api/auth/me  { avatar }
async function actualizarPerfil(req, res, next) {
  try {
    const { avatar } = req.body;
    const { rows } = await pool.query(
      `update usuarios set avatar = $1 where id = $2
       returning id, nombre, email, activo, avatar, es_super_admin`,
      [avatar ?? null, req.usuario.id]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    res.json({ ...rows[0], rol: req.usuario.rol, empresa_id: req.usuario.empresa_id });
  } catch (err) {
    next(err);
  }
}

// PUT /api/auth/password  { password_actual, password_nueva }
async function cambiarPassword(req, res, next) {
  try {
    const { password_actual, password_nueva } = req.body;
    if (!password_actual || !password_nueva) {
      return res.status(400).json({ mensaje: 'password_actual y password_nueva son requeridos' });
    }
    if (password_nueva.length < 6) {
      return res.status(400).json({ mensaje: 'La nueva contrasena debe tener al menos 6 caracteres' });
    }

    const { rows } = await pool.query('select password_hash from usuarios where id = $1', [req.usuario.id]);
    if (!rows[0]) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    const passwordOk = await bcrypt.compare(password_actual, rows[0].password_hash);
    if (!passwordOk) {
      return res.status(401).json({ mensaje: 'La contrasena actual no es correcta' });
    }

    const password_hash = await bcrypt.hash(password_nueva, 10);
    await pool.query('update usuarios set password_hash = $1 where id = $2', [password_hash, req.usuario.id]);

    res.json({ mensaje: 'Contrasena actualizada correctamente' });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, seleccionarEmpresa, misEmpresas, me, actualizarPerfil, cambiarPassword };
