const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { enviarCorreo, escaparHtml } = require('../utils/correo');
const { obtenerPolitica, generarPasswordSegunPolitica } = require('../utils/politicaPassword');
const { resolverUsuarioPortal, cambiarEmailAcceso } = require('../utils/resolverUsuarioPortal');

// true si la cuenta vinculada a este doctor (doctores.usuario_id) ya tiene
// el rol 'doctor' en ESTA clinica puntual -- ver invitar()/desinvitar()
// mas abajo. Un doctor sin usuario_id (nunca invitado) siempre da false.
const TIENE_ACCESO_ESTA_CLINICA = `
  exists(
    select 1 from usuarios_empresas_rol uer
    where uer.usuario_id = d.usuario_id and uer.empresa_id = de.empresa_id and uer.rol = 'doctor'
  ) as tiene_acceso_esta_clinica
`;

// Un doctor puede tener varias especialidades (tabla puente
// doctor_especialidades), cada una con su propio numero de colegiado.
// especialidad_nombre viaja tambien como string ya unido ("Cardiologia,
// Pediatria") para las pantallas que solo muestran texto (receta,
// WhatsApp, listados) sin necesitar el arreglo estructurado.
// La especialidad que ejerce un doctor es un hecho de la persona, no de
// la relacion con una clinica puntual -- por eso es un solo listado
// GLOBAL (sin filtro de empresa), compartido por todas las clinicas
// donde trabaje. Solo se le pueden asignar especialidades del catalogo
// GLOBAL (ver validarEspecialidades), nunca privadas de una clinica --
// asi "que doctores tienen la especialidad X en toda la red" se puede
// responder consultando por un mismo especialidad_id, sin que cada
// clinica tenga su propia fila para el mismo nombre. Una clinica puede
// seguir teniendo especialidades privadas para su propio catalogo (ver
// especialidades.controller.js), solo que no son asignables a un doctor.
const SELECT_DOCTOR = `
  select
    d.*,
    de.activo,
    ${TIENE_ACCESO_ESTA_CLINICA},
    coalesce((
      select json_agg(json_build_object('especialidad_id', e.id, 'nombre', e.nombre, 'numero_colegiado', de2.numero_colegiado) order by e.nombre)
      from doctor_especialidades de2
      join especialidades e on e.id = de2.especialidad_id
      where de2.doctor_id = d.id
    ), '[]') as especialidades,
    (
      select string_agg(e.nombre, ', ' order by e.nombre)
      from doctor_especialidades de2
      join especialidades e on e.id = de2.especialidad_id
      where de2.doctor_id = d.id
    ) as especialidad_nombre
  from doctores d
  join doctores_empresas de on de.doctor_id = d.id
`;

async function obtenerDoctorConEspecialidades(ejecutor, id, empresaId) {
  const { rows } = await ejecutor.query(`${SELECT_DOCTOR} where d.id = $1 and de.empresa_id = $2`, [id, empresaId]);
  return rows[0] || null;
}

// Valida que el arreglo de especialidades sea correcto: no vacio, sin
// repetidos, y todas del catalogo GLOBAL (nunca privadas de una
// clinica). Devuelve un mensaje de error (string) o null si esta todo
// bien.
async function validarEspecialidades(ejecutor, especialidades) {
  if (!Array.isArray(especialidades) || especialidades.length === 0) {
    return 'Debe indicar al menos una especialidad';
  }
  const ids = especialidades.map((e) => e.especialidad_id);
  if (new Set(ids).size !== ids.length) {
    return 'No se puede repetir una especialidad';
  }
  const { rows } = await ejecutor.query('select id from especialidades where id = any($1::uuid[]) and empresa_id is null', [ids]);
  if (rows.length !== ids.length) {
    return 'Alguna especialidad indicada no es del catalogo global';
  }
  return null;
}

// El listado de especialidades de un doctor es global y solo contiene
// especialidades globales -- el reemplazo (delete+insert) no necesita
// filtrar por empresa.
async function reemplazarEspecialidades(ejecutor, doctorId, especialidades) {
  await ejecutor.query('delete from doctor_especialidades where doctor_id = $1', [doctorId]);
  if (!especialidades.length) return;
  // Un solo insert multi-fila en vez de uno por especialidad -- menos
  // round-trips a la base (Neon agrega latencia real por cada uno).
  const valores = [];
  const marcadores = especialidades.map((e, i) => {
    valores.push(doctorId, e.especialidad_id, e.numero_colegiado || null);
    const base = i * 3;
    return `($${base + 1}, $${base + 2}, $${base + 3})`;
  });
  await ejecutor.query(
    `insert into doctor_especialidades (doctor_id, especialidad_id, numero_colegiado) values ${marcadores.join(', ')}`,
    valores
  );
}

async function listar(req, res, next) {
  try {
    const { rows } = await pool.query(`${SELECT_DOCTOR} where de.empresa_id = $1 order by d.nombre asc`, [req.empresaId]);
    res.json(rows);
  } catch (err) { next(err); }
}

async function obtener(req, res, next) {
  try {
    const doctor = await obtenerDoctorConEspecialidades(pool, req.params.id, req.empresaId);
    if (!doctor) return res.status(404).json({ mensaje: 'Doctor no encontrado' });
    res.json(doctor);
  } catch (err) { next(err); }
}

// GET /api/doctores/buscar?identificacion=X
// Busca un doctor en TODA la red (no solo en esta clinica), para saber
// si ya existe antes de crear uno nuevo -- mismo patron que
// pacientes.buscarPorIdentificacion. No revela si ya esta vinculado a
// otra clinica, solo que la persona ya existe en la plataforma.
async function buscarPorIdentificacion(req, res, next) {
  try {
    const identificacion = (req.query.identificacion || '').trim();
    if (!identificacion) return res.status(400).json({ mensaje: 'identificacion es requerida' });

    // Incluye especialidades -- son un hecho global de la persona (ver
    // comentario de SELECT_DOCTOR), no dependen de la clinica actual, asi
    // que se copian igual que nombre/telefono cuando el doctor ya existe
    // en otra clinica de la red. Sin join a doctores_empresas: este
    // doctor puede no estar vinculado todavia a NINGUNA clinica.
    const { rows } = await pool.query(
      `select d.*,
              coalesce((
                select json_agg(json_build_object('especialidad_id', e.id, 'nombre', e.nombre, 'numero_colegiado', de2.numero_colegiado) order by e.nombre)
                from doctor_especialidades de2 join especialidades e on e.id = de2.especialidad_id
                where de2.doctor_id = d.id
              ), '[]') as especialidades,
              (
                select string_agg(e.nombre, ', ' order by e.nombre)
                from doctor_especialidades de2 join especialidades e on e.id = de2.especialidad_id
                where de2.doctor_id = d.id
              ) as especialidad_nombre
       from doctores d where d.identificacion = $1`,
      [identificacion]
    );
    if (!rows[0]) return res.json({ existe: false });
    res.json({ existe: true, doctor: rows[0] });
  } catch (err) { next(err); }
}

// POST /api/doctores
// Si ya existe un doctor con esa identificacion en la red, no se
// duplica: se reutiliza el registro global y solo se crea el vinculo
// con esta clinica (doctores_empresas), con sus propias especialidades.
// Si no existe, se crea de cero.
async function crear(req, res, next) {
  const client = await pool.connect();
  try {
    const { nombre, identificacion, especialidades, telefono, acepta_whatsapp, email, activo, foto } = req.body;

    const errorEspecialidades = await validarEspecialidades(client, especialidades);
    if (errorEspecialidades) return res.status(400).json({ mensaje: errorEspecialidades });

    await client.query('begin');

    let doctor = null;
    if (identificacion) {
      const r = await client.query('select * from doctores where identificacion = $1', [identificacion]);
      doctor = r.rows[0] || null;
    }

    if (doctor) {
      const yaVinculado = await client.query(
        'select 1 from doctores_empresas where doctor_id = $1 and empresa_id = $2',
        [doctor.id, req.empresaId]
      );
      if (yaVinculado.rows[0]) {
        await client.query('rollback');
        return res.status(409).json({ mensaje: `${doctor.nombre} ya esta registrado en esta clinica.` });
      }
    } else {
      if (!nombre) {
        await client.query('rollback');
        return res.status(400).json({ mensaje: 'nombre es requerido para un doctor nuevo' });
      }
      const ins = await client.query(
        `insert into doctores (nombre, identificacion, telefono, acepta_whatsapp, email, foto)
         values ($1,$2,$3, coalesce($4, false),$5,$6) returning *`,
        [nombre, identificacion || null, telefono, acepta_whatsapp, email, foto || null]
      );
      doctor = ins.rows[0];
    }

    await client.query(
      `insert into doctores_empresas (doctor_id, empresa_id, activo) values ($1, $2, coalesce($3, true))`,
      [doctor.id, req.empresaId, activo]
    );
    await reemplazarEspecialidades(client, doctor.id, especialidades);

    await client.query('commit');

    const doctorFinal = await obtenerDoctorConEspecialidades(client, doctor.id, req.empresaId);
    res.status(201).json(doctorFinal);
  } catch (err) {
    await client.query('rollback');
    if (err.code === '23505') return res.status(409).json({ mensaje: 'Ya existe un doctor con esa identificacion.' });
    next(err);
  } finally {
    client.release();
  }
}

// PUT /api/doctores/:id
// Actualiza los datos globales de la persona (nombre, contacto, etc.) y,
// si viene "activo", el estado de la relacion con ESTA clinica puntual
// (no afecta su estado en otras clinicas).
async function actualizar(req, res, next) {
  const client = await pool.connect();
  try {
    const { nombre, identificacion, especialidades, telefono, acepta_whatsapp, email, activo, foto } = req.body;

    const vinculo = await client.query(
      'select 1 from doctores_empresas where doctor_id = $1 and empresa_id = $2',
      [req.params.id, req.empresaId]
    );
    if (!vinculo.rows[0]) return res.status(404).json({ mensaje: 'Doctor no encontrado' });

    if (especialidades !== undefined) {
      const errorEspecialidades = await validarEspecialidades(client, especialidades);
      if (errorEspecialidades) return res.status(400).json({ mensaje: errorEspecialidades });
    }

    await client.query('begin');

    // Un solo round-trip para los dos updates (CTE): la conexion a Neon
    // agrega latencia real por cada ida y vuelta, y este endpoint ya
    // hace varias.
    await client.query(
      `with upd as (
         update doctores set
           nombre = coalesce($1, nombre),
           identificacion = coalesce($2, identificacion),
           telefono = coalesce($3, telefono),
           acepta_whatsapp = coalesce($4, acepta_whatsapp),
           email = coalesce($5, email),
           foto = coalesce($9, foto)
         where id = $6
       )
       update doctores_empresas set activo = coalesce($7, activo) where doctor_id = $6 and empresa_id = $8`,
      [nombre, identificacion, telefono, acepta_whatsapp, email, req.params.id, activo, req.empresaId, foto]
    );

    if (especialidades !== undefined) await reemplazarEspecialidades(client, req.params.id, especialidades);

    await client.query('commit');

    const doctor = await obtenerDoctorConEspecialidades(client, req.params.id, req.empresaId);
    res.json(doctor);
  } catch (err) {
    await client.query('rollback');
    if (err.code === '23505') return res.status(409).json({ mensaje: 'Ya existe un doctor con esa identificacion.' });
    next(err);
  } finally {
    client.release();
  }
}

// DELETE /api/doctores/:id
// No borra al doctor globalmente (puede seguir vinculado a otras
// clinicas): solo quita su vinculo con ESTA clinica y sus horarios
// propios de ella -- mismo criterio que pacientes.controller.js#eliminar.
// Las especialidades NO se tocan: son un hecho global de la persona,
// no de la relacion con esta clinica puntual.
async function eliminar(req, res, next) {
  const client = await pool.connect();
  try {
    const vinculo = await client.query(
      'select 1 from doctores_empresas where doctor_id = $1 and empresa_id = $2',
      [req.params.id, req.empresaId]
    );
    if (!vinculo.rows[0]) return res.status(404).json({ mensaje: 'Doctor no encontrado' });

    const tieneCitas = await client.query(
      'select 1 from citas where doctor_id = $1 and empresa_id = $2 limit 1',
      [req.params.id, req.empresaId]
    );
    if (tieneCitas.rows[0]) {
      return res.status(409).json({ mensaje: 'No se puede eliminar: este doctor ya tiene citas registradas en esta clinica.' });
    }

    await client.query('begin');
    await client.query(
      `delete from doctor_horarios where doctor_id = $1 and sucursal_id in (select id from sucursales where empresa_id = $2)`,
      [req.params.id, req.empresaId]
    );
    // Las especialidades no se tocan: son globales, un hecho de la
    // persona sin relacion con esta clinica puntual.
    await client.query('delete from doctores_empresas where doctor_id = $1 and empresa_id = $2', [req.params.id, req.empresaId]);
    await client.query('commit');

    res.status(204).send();
  } catch (err) {
    await client.query('rollback');
    next(err);
  } finally {
    client.release();
  }
}

// POST /api/doctores/:id/invitar (solo admin)
// Crea (o reutiliza, con confirmacion -- ver resolverUsuarioPortal()) una
// cuenta de acceso al sistema para el doctor, con rol 'doctor' en ESTA
// clinica -- puede loguearse, elegir esta clinica al entrar, y
// ver/gestionar sus propias citas y horarios (incluidos los de otras
// clinicas donde trabaje, ver doctorHorarios.controller.js). Mismo patron
// que pacientes.controller.js#invitar, pero dar acceso de STAFF es mas
// sensible que dar acceso de portal de solo lectura -- por eso queda
// restringido a admin (ver doctores.routes.js), a diferencia de invitar
// paciente que tambien permite doctor.
async function invitar(req, res, next) {
  const client = await pool.connect();
  try {
    const doctorRes = await client.query(
      `select d.* from doctores d
       join doctores_empresas de on de.doctor_id = d.id
       where d.id = $1 and de.empresa_id = $2`,
      [req.params.id, req.empresaId]
    );
    const doctor = doctorRes.rows[0];
    if (!doctor) return res.status(404).json({ mensaje: 'Doctor no encontrado' });
    if (!doctor.email) return res.status(400).json({ mensaje: 'El doctor no tiene correo registrado' });

    await client.query('begin');

    let usuarioId = doctor.usuario_id;
    let nuevaCuenta = false;
    let passwordTemporal = null;

    if (!usuarioId) {
      try {
        const resuelto = await resolverUsuarioPortal({
          client, nombre: doctor.nombre, email: doctor.email,
          confirmarVincularExistente: req.body.confirmarVincularExistente === true,
          tablaVinculo: 'doctores', etiquetaVinculo: 'doctor',
        });
        usuarioId = resuelto.usuarioId;
        nuevaCuenta = resuelto.nuevaCuenta;
        passwordTemporal = resuelto.passwordTemporal;
      } catch (err) {
        await client.query('rollback');
        if (err.yaVinculadoAOtro) {
          return res.status(409).json({
            mensaje: `Ya existe una cuenta con el correo ${doctor.email}, pero ya esta vinculada a otro doctor ("${err.otroNombre}") -- una cuenta no puede representar a dos doctores distintos. Corrige el correo de este doctor antes de invitarlo.`,
          });
        }
        if (err.requiereConfirmacion) {
          return res.status(409).json({
            mensaje: `Ya existe una cuenta con el correo ${doctor.email}, a nombre de "${err.cuentaExistente.nombre}". Si es la misma persona, confirma para vincularla -- si no, corrige el correo del doctor antes de invitarlo.`,
            requiereConfirmacion: true,
            cuenta_existente_nombre: err.cuentaExistente.nombre,
          });
        }
        throw err;
      }
      await client.query('update doctores set usuario_id = $1 where id = $2', [usuarioId, doctor.id]);
    }

    // Una cuenta puede tener a la vez el rol 'doctor' Y otro rol de staff
    // (admin/recepcionista) en la MISMA clinica -- ej. el dueno de la
    // clinica que ademas atiende como doctor ahi mismo. La base lo permite
    // (uq_usuarios_empresas_rol_staff incluye "rol" en la clave unica);
    // aca solo bloqueamos si YA es doctor en esta clinica especificamente,
    // mismo criterio que invitar-paciente.
    const yaEsDoctor = await client.query(
      "select 1 from usuarios_empresas_rol where usuario_id = $1 and empresa_id = $2 and rol = 'doctor'",
      [usuarioId, req.empresaId]
    );
    if (yaEsDoctor.rows[0]) {
      await client.query('rollback');
      return res.status(409).json({ mensaje: 'Este doctor ya tiene acceso a esta clinica.' });
    }
    await client.query(
      `insert into usuarios_empresas_rol (usuario_id, empresa_id, rol) values ($1, $2, 'doctor')`,
      [usuarioId, req.empresaId]
    );

    const empresaRes = await client.query('select nombre from empresas where id = $1', [req.empresaId]);
    const empresaNombre = empresaRes.rows[0]?.nombre || 'la clinica';

    await client.query('commit');

    const enlace = `${process.env.CORS_ORIGIN || 'http://localhost:4201'}/login`;
    const correo = nuevaCuenta
      ? {
          destinatario: doctor.email,
          asunto: `Acceso al sistema - ${empresaNombre}`,
          texto: `Hola ${doctor.nombre},\n\n${empresaNombre} te dio acceso al sistema con rol de doctor: puedes ver tus citas y gestionar tu horario.\n\nUsuario: ${doctor.email}\nContrasena temporal: ${passwordTemporal}\n\nIngresa aqui: ${enlace}\n\nPor seguridad, se te pedira cambiar esta contrasena la primera vez que inicies sesion.`,
          html: `<p>Hola ${escaparHtml(doctor.nombre)},</p><p>${escaparHtml(empresaNombre)} te dio acceso al sistema con rol de doctor: puedes ver tus citas y gestionar tu horario.</p><p>Usuario: ${escaparHtml(doctor.email)}<br>Contrasena temporal: <code style="font-size:16px;font-weight:bold;">${escaparHtml(passwordTemporal)}</code></p><p>Ingresa aqui: <a href="${enlace}">${enlace}</a></p><p>Por seguridad, se te pedira cambiar esta contrasena la primera vez que inicies sesion.</p>`,
        }
      : {
          destinatario: doctor.email,
          asunto: `Acceso al sistema - ${empresaNombre}`,
          texto: `Hola ${doctor.nombre},\n\n${empresaNombre} te dio acceso al sistema con rol de doctor: puedes ver tus citas y gestionar tu horario.\n\nYa tenias una cuenta en el sistema (${doctor.email}): inicia sesion con tu contrasena habitual y elige esta clinica.\n\nIngresa aqui: ${enlace}`,
          html: `<p>Hola ${escaparHtml(doctor.nombre)},</p><p>${escaparHtml(empresaNombre)} te dio acceso al sistema con rol de doctor: puedes ver tus citas y gestionar tu horario.</p><p>Ya tenias una cuenta en el sistema (${escaparHtml(doctor.email)}): inicia sesion con tu contrasena habitual y elige esta clinica.</p><p>Ingresa aqui: <a href="${enlace}">${enlace}</a></p>`,
        };
    enviarCorreo(correo).catch((err) => console.error('Error enviando correo de invitacion a doctor:', err.message));

    const doctorFinal = await obtenerDoctorConEspecialidades(pool, doctor.id, req.empresaId);
    res.json(doctorFinal);
  } catch (err) {
    await client.query('rollback');
    next(err);
  } finally {
    client.release();
  }
}

// DELETE /api/doctores/:id/invitar (solo admin) -- revoca el acceso de
// doctor en ESTA clinica puntual (borra solo la fila usuarios_empresas_rol
// de esta clinica). No borra la cuenta ni toca su acceso en otras
// clinicas donde tambien trabaje. Si esta era la UNICA clinica donde
// tenia rol 'doctor' con esa cuenta, ademas se limpia doctores.usuario_id
// -- si no, una proxima invitacion reutilizaria para siempre la misma
// cuenta (ver resolverUsuarioPortal()), incluso si quedo mal vinculada
// por un correo mal escrito. El chequeo es "en NINGUNA clinica" porque
// usuario_id es GLOBAL: limpiarlo mientras el doctor sigue con acceso
// activo en otra clinica dejaria ese acceso "huerfano" (TIENE_ACCESO_ESTA_CLINICA
// se calcula por join contra d.usuario_id).
async function desinvitar(req, res, next) {
  try {
    const doctorRes = await pool.query(
      `select d.usuario_id from doctores d
       join doctores_empresas de on de.doctor_id = d.id
       where d.id = $1 and de.empresa_id = $2`,
      [req.params.id, req.empresaId]
    );
    const doctor = doctorRes.rows[0];
    if (!doctor) return res.status(404).json({ mensaje: 'Doctor no encontrado' });
    if (!doctor.usuario_id) return res.status(404).json({ mensaje: 'Este doctor no tiene acceso en esta clinica' });

    const { rowCount } = await pool.query(
      "delete from usuarios_empresas_rol where usuario_id = $1 and empresa_id = $2 and rol = 'doctor'",
      [doctor.usuario_id, req.empresaId]
    );
    if (!rowCount) return res.status(404).json({ mensaje: 'Este doctor no tiene acceso en esta clinica' });

    const quedaAcceso = await pool.query(
      "select 1 from usuarios_empresas_rol where usuario_id = $1 and rol = 'doctor'",
      [doctor.usuario_id]
    );
    if (!quedaAcceso.rows[0]) {
      await pool.query('update doctores set usuario_id = null where id = $1', [req.params.id]);
    }

    const doctorFinal = await obtenerDoctorConEspecialidades(pool, req.params.id, req.empresaId);
    res.json(doctorFinal);
  } catch (err) { next(err); }
}

// PUT /api/doctores/:id/correo-acceso (solo admin) -- corrige el correo de
// LOGIN (usuarios.email) de un doctor ya invitado, sin tocar su correo de
// contacto (doctores.email). Mismo motivo que pacientes.controller.js#cambiarCorreoAcceso.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function cambiarCorreoAcceso(req, res, next) {
  try {
    const nuevoEmail = String(req.body.email || '').trim().toLowerCase();
    if (!EMAIL_REGEX.test(nuevoEmail)) return res.status(400).json({ mensaje: 'Correo invalido' });

    const doctorRes = await pool.query(
      `select d.email, d.usuario_id, u.email as usuario_email from doctores d
       join doctores_empresas de on de.doctor_id = d.id
       join usuarios u on u.id = d.usuario_id
       where d.id = $1 and de.empresa_id = $2`,
      [req.params.id, req.empresaId]
    );
    const doctor = doctorRes.rows[0];
    if (!doctor) return res.status(404).json({ mensaje: 'Doctor no encontrado' });
    if (!doctor.usuario_id) return res.status(400).json({ mensaje: 'Este doctor no tiene una cuenta de acceso vinculada' });

    try {
      await cambiarEmailAcceso({ pool, usuarioId: doctor.usuario_id, nuevoEmail });
    } catch (err) {
      if (err.correoOcupado) return res.status(409).json({ mensaje: 'Ese correo ya pertenece a otra cuenta.' });
      throw err;
    }

    // Igual que en pacientes.controller.js#cambiarCorreoAcceso: si el
    // correo de contacto coincidia con el de acceso antes del cambio,
    // se mantienen sincronizados.
    if (doctor.email && doctor.email.toLowerCase() === doctor.usuario_email.toLowerCase()) {
      await pool.query('update doctores set email = $1 where id = $2', [nuevoEmail, req.params.id]);
    }

    const doctorFinal = await obtenerDoctorConEspecialidades(pool, req.params.id, req.empresaId);
    res.json(doctorFinal);
  } catch (err) { next(err); }
}

// POST /api/doctores/:id/resetear-password (solo admin) -- mismo patron
// que pacientes.controller.js#resetearPassword: el correo se envia ANTES
// de guardar el cambio, para no dejar al doctor con una contrasena que
// nunca le llego.
async function resetearPassword(req, res, next) {
  try {
    const doctorRes = await pool.query(
      `select d.nombre, d.email, d.usuario_id, ${TIENE_ACCESO_ESTA_CLINICA}
       from doctores d
       join doctores_empresas de on de.doctor_id = d.id
       where d.id = $1 and de.empresa_id = $2`,
      [req.params.id, req.empresaId]
    );
    const doctor = doctorRes.rows[0];
    if (!doctor) return res.status(404).json({ mensaje: 'Doctor no encontrado' });
    if (!doctor.tiene_acceso_esta_clinica) {
      return res.status(404).json({ mensaje: 'Este doctor no tiene acceso al sistema en esta clinica' });
    }

    const politica = await obtenerPolitica();
    const passwordTemporal = generarPasswordSegunPolitica(politica);
    const password_hash = await bcrypt.hash(passwordTemporal, 10);

    const empresaRes = await pool.query('select nombre from empresas where id = $1', [req.empresaId]);
    const empresaNombre = empresaRes.rows[0]?.nombre || 'la clinica';
    const enlace = `${process.env.CORS_ORIGIN || 'http://localhost:4201'}/login`;

    try {
      await enviarCorreo({
        destinatario: doctor.email,
        asunto: `Tu contrasena fue restablecida - ${empresaNombre}`,
        texto: `Hola ${doctor.nombre},\n\n${empresaNombre} restablecio tu contrasena de acceso al sistema.\n\nUsuario: ${doctor.email}\nContrasena temporal: ${passwordTemporal}\n\nIngresa aqui: ${enlace}\n\nPor seguridad, se te pedira cambiar esta contrasena la primera vez que inicies sesion.`,
        html: `<p>Hola ${escaparHtml(doctor.nombre)},</p><p>${escaparHtml(empresaNombre)} restablecio tu contrasena de acceso al sistema.</p><p>Usuario: ${escaparHtml(doctor.email)}<br>Contrasena temporal: <code style="font-size:16px;font-weight:bold;">${escaparHtml(passwordTemporal)}</code></p><p>Ingresa aqui: <a href="${enlace}">${enlace}</a></p><p>Por seguridad, se te pedira cambiar esta contrasena la primera vez que inicies sesion.</p>`,
      });
    } catch (err) {
      return res.status(502).json({ mensaje: 'No se pudo enviar el correo con la nueva contrasena. Intenta de nuevo.' });
    }

    await pool.query(
      'update usuarios set password_hash = $1, debe_cambiar_password = true where id = $2',
      [password_hash, doctor.usuario_id]
    );

    res.json({ mensaje: `Se envio una nueva contrasena al correo ${doctor.email}` });
  } catch (err) { next(err); }
}

// GET /api/doctores/mi-perfil (autenticado, cuenta con doctores.usuario_id
// propio) -- portal del doctor: sus datos + en que clinicas tiene rol
// 'doctor' (sin importar cual este activa en la sesion ahora mismo), para
// que pueda ver/gestionar su horario en cualquiera de ellas (ver
// doctorHorarios.controller.js, que ya soporta esto cross-clinica).
async function miPerfil(req, res, next) {
  try {
    const { rows: idRows } = await pool.query('select id from doctores where usuario_id = $1', [req.usuario.id]);
    if (!idRows[0]) return res.status(404).json({ mensaje: 'Esta cuenta no tiene un perfil de doctor vinculado' });
    const doctorId = idRows[0].id;

    const { rows: doctorRows } = await pool.query(
      `select d.*,
              coalesce((
                select json_agg(json_build_object('especialidad_id', esp.id, 'nombre', esp.nombre, 'numero_colegiado', de2.numero_colegiado) order by esp.nombre)
                from doctor_especialidades de2 join especialidades esp on esp.id = de2.especialidad_id
                where de2.doctor_id = d.id
              ), '[]') as especialidades,
              (
                select string_agg(esp.nombre, ', ' order by esp.nombre)
                from doctor_especialidades de2 join especialidades esp on esp.id = de2.especialidad_id
                where de2.doctor_id = d.id
              ) as especialidad_nombre
       from doctores d where d.id = $1`,
      [doctorId]
    );

    const { rows: empresas } = await pool.query(
      `select e.id as empresa_id, e.nombre as empresa_nombre, coalesce(de.activo, false) as activo
       from usuarios_empresas_rol uer
       join empresas e on e.id = uer.empresa_id
       left join doctores_empresas de on de.doctor_id = $1 and de.empresa_id = e.id
       where uer.usuario_id = $2 and uer.rol = 'doctor'
       order by e.nombre`,
      [doctorId, req.usuario.id]
    );

    res.json({ doctor: doctorRows[0], empresas });
  } catch (err) { next(err); }
}

module.exports = { listar, obtener, buscarPorIdentificacion, crear, actualizar, eliminar, invitar, desinvitar, cambiarCorreoAcceso, resetearPassword, miPerfil };
