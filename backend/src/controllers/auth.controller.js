const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const { pool } = require('../config/db');
const { encriptar, desencriptar } = require('../utils/cifrado2fa');
const { porcentajeSimilitud } = require('../utils/levenshtein');
const { enviarCorreo } = require('../utils/correo');
const { nombreInstanciaDb } = require('../utils/instanciaDb');

// Access token: corto (JWT_EXPIRES_IN, recomendado 15-30m) y stateless --
// se verifica solo por firma, sin tocar la base de datos, en cada request.
// Refresh token: opaco y de vida larga (REFRESH_TOKEN_EXPIRES_IN_HOURS),
// guardado en la tabla "sesiones" (migracion 026) -- es lo unico que se
// valida contra la BD, y solo cuando se pide /auth/refresh (no en cada
// request). Se rota en cada uso: cada refresh invalida el anterior, para
// que un refresh token filtrado no sirva mas de una vez sin ser detectado.
function firmarAccessToken(payload, expiresIn) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: expiresIn || process.env.JWT_EXPIRES_IN || '30m' });
}

function generarRefreshToken() {
  return 'ref_' + crypto.randomBytes(32).toString('hex');
}

function horasRefreshToken() {
  return Number(process.env.REFRESH_TOKEN_EXPIRES_IN_HOURS) || 12;
}

// Emite el par access+refresh de un login completo (o de una seleccion de
// empresa) e inserta la fila de "sesiones" -- nunca se llama para los
// tokens parciales (10 min, en espera de elegir empresa o completar 2FA),
// esos no tienen refresh token.
async function emitirTokens({ usuarioId, empresaId, empresaNombre, rol, payloadAccessToken }) {
  const accessToken = firmarAccessToken(payloadAccessToken);
  const refreshToken = generarRefreshToken();
  const expiraEn = new Date(Date.now() + horasRefreshToken() * 60 * 60 * 1000);

  await pool.query(
    `insert into sesiones (usuario_id, empresa_id, empresa_nombre, rol, token, expira_en)
     values ($1, $2, $3, $4, $5, $6)`,
    [usuarioId, empresaId || null, empresaNombre || null, rol || null, refreshToken, expiraEn]
  );

  return { accessToken, refreshToken };
}

// Continua el login despues de validar password (o codigo 2FA): resuelve
// la(s) clinica(s) del usuario y emite el JWT final, o pide seleccionar
// empresa si tiene mas de una. Compartido entre login() y verificar2FA().
async function continuarLoginTrasPassword(usuario, res) {
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
        es_super_admin: true, avatar: usuario.avatar, debe_cambiar_password: usuario.debe_cambiar_password,
      };
      const { accessToken, refreshToken } = await emitirTokens({
        usuarioId: usuario.id, empresaId: null, empresaNombre: null, rol: null,
        payloadAccessToken: { id: payload.id, nombre: payload.nombre, email: payload.email, rol: null, empresa_id: null, es_super_admin: true, debe_cambiar_password: usuario.debe_cambiar_password },
      });
      return res.json({ token: accessToken, refreshToken, usuario: payload });
    }

    const tokenParcial = firmarAccessToken(
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
    const tokenParcial = firmarAccessToken(
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
    debe_cambiar_password: usuario.debe_cambiar_password,
  };
  const { accessToken, refreshToken } = await emitirTokens({
    usuarioId: usuario.id, empresaId: payload.empresa_id, empresaNombre: payload.empresa_nombre, rol: payload.rol,
    payloadAccessToken: { id: payload.id, nombre: payload.nombre, email: payload.email, rol: payload.rol, empresa_id: payload.empresa_id, es_super_admin: payload.es_super_admin, debe_cambiar_password: payload.debe_cambiar_password },
  });

  res.json({ token: accessToken, refreshToken, usuario: payload });
}

// POST /api/auth/login
// Si el usuario tiene 2FA activo, responde { requiere2FA, usuarioId } y el
// frontend debe llamar a /auth/2fa/verify-login con el codigo. Si no,
// continua el flujo normal (una clinica: JWT final; varias: seleccion).
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ mensaje: 'Email y password son requeridos' });
    }

    const { rows } = await pool.query(
      `select id, nombre, email, password_hash, activo, avatar, es_super_admin,
              two_factor_enabled, two_factor_secret, debe_cambiar_password
       from usuarios where email = $1`,
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

    if (usuario.two_factor_enabled) {
      return res.json({ requiere2FA: true, usuarioId: usuario.id });
    }

    await continuarLoginTrasPassword(usuario, res);
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/2fa/verify-login  { usuarioId, code }
async function verificar2FA(req, res, next) {
  try {
    const { usuarioId, code } = req.body;
    if (!usuarioId || !code) {
      return res.status(400).json({ mensaje: 'usuarioId y code son requeridos' });
    }

    const { rows } = await pool.query(
      `select id, nombre, email, activo, avatar, es_super_admin, two_factor_enabled, two_factor_secret, debe_cambiar_password
       from usuarios where id = $1`,
      [usuarioId]
    );
    const usuario = rows[0];

    if (!usuario || !usuario.activo || !usuario.two_factor_enabled || !usuario.two_factor_secret) {
      return res.status(401).json({ mensaje: 'Sesion invalida, inicia sesion nuevamente' });
    }

    const secret = desencriptar(usuario.two_factor_secret);
    const esValido = authenticator.check(String(code).trim(), secret);
    if (!esValido) {
      return res.status(401).json({ mensaje: 'Codigo invalido' });
    }

    await continuarLoginTrasPassword(usuario, res);
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/2fa/setup  (autenticado)
// Genera un secreto nuevo + QR de enrolamiento. No se guarda todavia --
// se confirma con /auth/2fa/enable una vez el usuario escanea y valida un
// codigo, para evitar guardar un secreto que el usuario nunca configuro.
async function setup2FA(req, res, next) {
  try {
    const { rows } = await pool.query('select email from usuarios where id = $1', [req.usuario.id]);
    const usuario = rows[0];
    if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(usuario.email, 'Clinica', secret);
    const qrCode = await QRCode.toDataURL(otpauth);

    res.json({ secret, qrCode });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/2fa/enable  { secret, code }  (autenticado)
async function enable2FA(req, res, next) {
  try {
    const { secret, code } = req.body;
    if (!secret || !code) return res.status(400).json({ mensaje: 'secret y code son requeridos' });

    const esValido = authenticator.check(String(code).trim(), secret);
    if (!esValido) return res.status(400).json({ mensaje: 'Codigo invalido' });

    const secretCifrado = encriptar(secret);
    await pool.query(
      'update usuarios set two_factor_secret = $1, two_factor_enabled = true where id = $2',
      [secretCifrado, req.usuario.id]
    );

    res.json({ mensaje: '2FA activado correctamente' });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/2fa/disable  { code }  (autenticado)
async function disable2FA(req, res, next) {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ mensaje: 'code es requerido' });

    const { rows } = await pool.query('select two_factor_secret from usuarios where id = $1', [req.usuario.id]);
    const usuario = rows[0];
    if (!usuario || !usuario.two_factor_secret) {
      return res.status(400).json({ mensaje: 'El 2FA no esta activo' });
    }

    const secret = desencriptar(usuario.two_factor_secret);
    const esValido = authenticator.check(String(code).trim(), secret);
    if (!esValido) return res.status(400).json({ mensaje: 'Codigo invalido' });

    await pool.query(
      'update usuarios set two_factor_secret = null, two_factor_enabled = false where id = $1',
      [req.usuario.id]
    );

    res.json({ mensaje: '2FA desactivado correctamente' });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/logout  { refreshToken, razon? }  (autenticado)
// Cierra la fila de "sesiones" duena de ese refresh token. Razones
// esperadas: 'logout_usuario' (default), 'inactividad'.
async function logout(req, res, next) {
  try {
    const { refreshToken, razon } = req.body || {};
    const razonSalida = razon || 'logout_usuario';
    if (refreshToken) {
      await pool.query(
        `update sesiones set activo = false, razon_salida = $1,
           duracion_segundos = extract(epoch from (now() - created_at))::integer
         where token = $2 and activo = true`,
        [razonSalida, refreshToken]
      );
    }
    res.json({ mensaje: 'Sesion cerrada' });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/refresh  { refreshToken }  (publico -- se usa cuando el
// access token ya expiro, asi que no puede exigir requireAuth)
// Valida el refresh token contra "sesiones" (la unica consulta a BD de
// todo el ciclo de autenticacion) y, si sigue activo y vigente, emite un
// access token nuevo + ROTA el refresh token (invalida el anterior) para
// que uno filtrado no se pueda reutilizar sin ser detectado.
async function refrescarToken(req, res, next) {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ mensaje: 'refreshToken es requerido' });

    const { rows } = await pool.query(
      `select s.id as sesion_id, s.usuario_id, s.empresa_id, s.empresa_nombre, s.rol as sesion_rol,
              u.nombre, u.email, u.avatar, u.es_super_admin, u.activo as usuario_activo, u.debe_cambiar_password
       from sesiones s
       join usuarios u on u.id = s.usuario_id
       where s.token = $1 and s.activo = true and s.expira_en > now()`,
      [refreshToken]
    );
    const sesion = rows[0];
    if (!sesion || !sesion.usuario_activo) {
      return res.status(401).json({ mensaje: 'Sesion invalida o expirada, inicia sesion nuevamente' });
    }

    const accessToken = firmarAccessToken({
      id: sesion.usuario_id,
      nombre: sesion.nombre,
      email: sesion.email,
      rol: sesion.sesion_rol,
      empresa_id: sesion.empresa_id,
      es_super_admin: sesion.es_super_admin,
      debe_cambiar_password: sesion.debe_cambiar_password,
    });
    const nuevoRefreshToken = generarRefreshToken();
    const nuevaExpiracion = new Date(Date.now() + horasRefreshToken() * 60 * 60 * 1000);
    await pool.query('update sesiones set token = $1, expira_en = $2 where id = $3', [nuevoRefreshToken, nuevaExpiracion, sesion.sesion_id]);

    res.json({
      token: accessToken,
      refreshToken: nuevoRefreshToken,
      usuario: {
        id: sesion.usuario_id,
        nombre: sesion.nombre,
        email: sesion.email,
        rol: sesion.sesion_rol,
        empresa_id: sesion.empresa_id,
        empresa_nombre: sesion.empresa_nombre,
        es_super_admin: sesion.es_super_admin,
        avatar: sesion.avatar,
        debe_cambiar_password: sesion.debe_cambiar_password,
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/pista?email=...  (publico, con rate-limit en la ruta)
async function obtenerPista(req, res, next) {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ mensaje: 'email es requerido' });

    const { rows } = await pool.query('select pista from usuarios where email = $1 and activo = true', [email]);
    const pista = rows[0]?.pista;
    if (!pista) return res.status(404).json({ mensaje: 'No hay una pista configurada para ese usuario' });

    res.json({ pista });
  } catch (err) {
    next(err);
  }
}

function generarTokenReset() {
  return 'rst_' + crypto.randomBytes(32).toString('hex');
}

// POST /api/auth/forgot-password  { email }  (publico, con rate-limit en la ruta)
// Nunca revela si el correo existe o no (evita enumeracion de usuarios) --
// la respuesta es siempre el mismo mensaje generico, exista o no la cuenta.
async function olvidoPassword(req, res, next) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ mensaje: 'email es requerido' });

    const { rows } = await pool.query('select id, nombre from usuarios where email = $1 and activo = true', [email]);
    const usuario = rows[0];

    if (usuario) {
      const token = generarTokenReset();
      const expiraEn = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
      await pool.query(
        'insert into password_reset_tokens (usuario_id, token, expira_en) values ($1, $2, $3)',
        [usuario.id, token, expiraEn]
      );

      const enlace = `${process.env.CORS_ORIGIN || 'http://localhost:4201'}/restablecer-password?token=${token}`;
      // El envio de correo no debe tumbar la respuesta si falla (SMTP
      // caido, etc.) -- de todas formas el mensaje al cliente es generico.
      enviarCorreo({
        destinatario: email,
        asunto: 'Recuperar tu contrasena',
        texto: `Hola ${usuario.nombre},\n\nRecibimos una solicitud para restablecer tu contrasena. Este enlace es valido por 1 hora:\n${enlace}\n\nSi no fuiste tu, ignora este correo.`,
        html: `<p>Hola ${usuario.nombre},</p><p>Recibimos una solicitud para restablecer tu contrasena. Este enlace es valido por 1 hora:</p><p><a href="${enlace}">${enlace}</a></p><p>Si no fuiste tu, ignora este correo.</p>`,
      }).catch((err) => console.error('Error enviando correo de recuperacion de contrasena:', err.message));
    }

    res.json({ mensaje: 'Si el correo existe en nuestro sistema, recibiras un enlace para restablecer tu contrasena.' });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/reset-password  { token, password_nueva }  (publico)
async function restablecerPassword(req, res, next) {
  try {
    const { token, password_nueva } = req.body || {};
    if (!token || !password_nueva) return res.status(400).json({ mensaje: 'token y password_nueva son requeridos' });
    if (password_nueva.length < 6) return res.status(400).json({ mensaje: 'La nueva contrasena debe tener al menos 6 caracteres' });

    const { rows } = await pool.query(
      `select id, usuario_id from password_reset_tokens where token = $1 and usado = false and expira_en > now()`,
      [token]
    );
    const registro = rows[0];
    if (!registro) return res.status(400).json({ mensaje: 'El enlace es invalido o ya expiro. Solicita uno nuevo.' });

    const password_hash = await bcrypt.hash(password_nueva, 10);
    await pool.query('update usuarios set password_hash = $1, debe_cambiar_password = false where id = $2', [password_hash, registro.usuario_id]);
    await pool.query('update password_reset_tokens set usado = true where id = $1', [registro.id]);
    // Cierra todas las sesiones activas de este usuario: si alguien mas
    // tenia acceso (motivo mas comun para pedir esto), queda desconectado
    // de inmediato en cuanto su access token vigente expire/intente refrescar.
    await pool.query(
      `update sesiones set activo = false, razon_salida = 'reset_password',
         duracion_segundos = extract(epoch from (now() - created_at))::integer
       where usuario_id = $1 and activo = true`,
      [registro.usuario_id]
    );

    res.json({ mensaje: 'Contrasena actualizada correctamente. Ya puedes iniciar sesion.' });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/session-config  (publico -- el login lo necesita antes de autenticarse)
function sessionConfig(req, res) {
  res.json({
    inactivityLimitMinutes: Number(process.env.SESSION_INACTIVITY_LIMIT_MINUTES) || 15,
    warningBeforeMinutes: Number(process.env.SESSION_WARNING_BEFORE_MINUTES) || 2,
    passwordHintMaxSimilarity: Number(process.env.PASSWORD_HINT_MAX_SIMILARITY) || 70,
    refreshIntervalMinutes: Number(process.env.SESSION_REFRESH_INTERVAL_MINUTES) || 10,
  });
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
      'select id, nombre, email, avatar, es_super_admin, debe_cambiar_password from usuarios where id = $1',
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
      debe_cambiar_password: usuario.debe_cambiar_password,
    };
    const { accessToken, refreshToken } = await emitirTokens({
      usuarioId: usuario.id, empresaId: empresa_id, empresaNombre, rol,
      payloadAccessToken: { id: payload.id, nombre: payload.nombre, email: payload.email, rol: payload.rol, empresa_id: payload.empresa_id, es_super_admin: payload.es_super_admin, debe_cambiar_password: payload.debe_cambiar_password },
    });

    res.json({ token: accessToken, refreshToken, usuario: payload });
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
      'select id, nombre, email, activo, avatar, es_super_admin, two_factor_enabled, created_at from usuarios where id = $1',
      [req.usuario.id]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    res.json({ ...rows[0], base_datos: nombreInstanciaDb(), rol: req.usuario.rol, empresa_id: req.usuario.empresa_id, empresa_nombre: req.usuario.empresa_nombre });
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

// PUT /api/auth/password  { password_actual, password_nueva, pista? }
// "pista" es opcional: si no se envia la clave en el body, no se toca la
// pista guardada; si se envia vacia, se borra; si se envia con texto, se
// valida que no se parezca demasiado a la nueva contrasena.
async function cambiarPassword(req, res, next) {
  try {
    const { password_actual, password_nueva, pista } = req.body;
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

    let pistaFinal;
    if (pista !== undefined) {
      pistaFinal = String(pista).trim() || null;
      if (pistaFinal) {
        const maxSimilitud = Number(process.env.PASSWORD_HINT_MAX_SIMILARITY) || 70;
        const similitud = porcentajeSimilitud(password_nueva, pistaFinal);
        if (similitud > maxSimilitud) {
          return res.status(400).json({
            mensaje: `La pista es demasiado obvia (${similitud.toFixed(0)}% de similitud con la contrasena). Debe parecerse menos de un ${maxSimilitud}%.`,
          });
        }
      }
    }

    const password_hash = await bcrypt.hash(password_nueva, 10);
    if (pista !== undefined) {
      await pool.query('update usuarios set password_hash = $1, pista = $2, debe_cambiar_password = false where id = $3', [password_hash, pistaFinal, req.usuario.id]);
    } else {
      await pool.query('update usuarios set password_hash = $1, debe_cambiar_password = false where id = $2', [password_hash, req.usuario.id]);
    }

    // Reemite el access token con debe_cambiar_password=false para que,
    // si este cambio era obligatorio, el frontend quede desbloqueado de
    // inmediato -- sin esto tendria que esperar hasta el proximo refresh
    // (proactivo cada SESSION_REFRESH_INTERVAL_MINUTES) para dejar de
    // recibir el 403 de "debes cambiar tu contrasena".
    const token = firmarAccessToken({
      id: req.usuario.id,
      nombre: req.usuario.nombre,
      email: req.usuario.email,
      rol: req.usuario.rol,
      empresa_id: req.usuario.empresa_id,
      es_super_admin: req.usuario.es_super_admin,
      debe_cambiar_password: false,
    });

    res.json({ mensaje: 'Contrasena actualizada correctamente', token });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login,
  verificar2FA,
  setup2FA,
  enable2FA,
  disable2FA,
  logout,
  refrescarToken,
  olvidoPassword,
  restablecerPassword,
  obtenerPista,
  sessionConfig,
  seleccionarEmpresa,
  misEmpresas,
  me,
  actualizarPerfil,
  cambiarPassword,
};
