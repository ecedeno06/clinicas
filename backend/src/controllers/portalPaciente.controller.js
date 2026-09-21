const { pool } = require('../config/db');
const { enviarSolicitudConsentimiento, enviarSolicitudRevocacion } = require('../utils/solicitudConsentimiento');

// Portal del rol 'paciente': a diferencia de pacientes.controller.js (uso
// de staff), aqui el paciente_id NUNCA viene de un parametro/query del
// cliente -- siempre se resuelve a partir de req.usuario.id (el usuario
// autenticado), para que no haya forma de pedir los datos de otro
// paciente. La sesion de un paciente NO tiene clinica activa (empresa_id
// null en el JWT, ver auth.controller.js) -- agrega la informacion de
// TODAS las clinicas donde tiene rol 'paciente', resueltas en cada
// consulta via EMPRESAS_AUTORIZADAS en vez de req.empresaId.

// Subconsulta reutilizada en todo este archivo: las clinicas que
// autorizaron a este usuario como paciente (puede ser mas de una).
const EMPRESAS_AUTORIZADAS = `(
  select empresa_id from usuarios_empresas_rol
  where usuario_id = $1 and rol = 'paciente'
)`;

const SELECT_DIRECCIONES = `
  coalesce((
    select json_agg(json_build_object(
      'id', dp.id, 'direccion', dp.direccion, 'google_maps_url', dp.google_maps_url,
      'pais', dp.pais, 'provincia', dp.provincia, 'distrito', dp.distrito, 'corregimiento', dp.corregimiento,
      'comparte_ubicacion', dp.comparte_ubicacion, 'es_principal', dp.es_principal
    ) order by dp.es_principal desc, dp.created_at)
    from direcciones_paciente dp
    where dp.paciente_id = p.id
  ), '[]') as direcciones
`;

const SELECT_FAMILIARES = `
  coalesce((
    select json_agg(json_build_object(
      'id', fp.id, 'nombre', fp.nombre, 'telefono', fp.telefono, 'parentesco', fp.parentesco
    ) order by fp.created_at)
    from familiares_paciente fp
    where fp.paciente_id = p.id
  ), '[]') as familiares
`;

const SELECT_ANTECEDENTES = `
  coalesce((
    select json_agg(json_build_object(
      'id', pa.id, 'antecedente_id', pa.antecedente_id,
      'antecedente_nombre', ap.nombre, 'categoria_nombre', c.nombre,
      'fecha_inicio', pa.fecha_inicio, 'tratamiento', pa.tratamiento, 'observacion', pa.observacion,
      'doctor_id', pa.doctor_id, 'doctor_nombre', d.nombre
    ) order by c.nombre, ap.nombre)
    from paciente_antecedente pa
    join antecedentes_patologicos ap on ap.id = pa.antecedente_id
    join categorias_antecedentes c on c.id = ap.categoria_id
    left join doctores d on d.id = pa.doctor_id
    where pa.paciente_id = p.id
  ), '[]') as antecedentes
`;

// La ficha del paciente es global (una sola fila para toda la red, igual
// que doctores) -- no hace falta filtrar por clinica para leerla/editarla,
// solo confirmar que el usuario_id coincide.
const SELECT_PERFIL_COMPLETO = `
  select p.*, ${SELECT_DIRECCIONES}, ${SELECT_FAMILIARES}, ${SELECT_ANTECEDENTES}
  from pacientes p
  where p.usuario_id = $1
`;

// GET /api/portal-paciente/perfil
async function perfil(req, res, next) {
  try {
    const { rows } = await pool.query(SELECT_PERFIL_COMPLETO, [req.usuario.id]);
    if (!rows[0]) return res.status(404).json({ mensaje: 'No se encontro tu ficha de paciente' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

// tipo_trabajo/lugar_trabajo solo tienen sentido si estado_laboral es
// 'trabaja' -- mismo criterio que pacientes.controller.js.
function normalizarDatosLaborales(estado_laboral, tipo_trabajo, lugar_trabajo) {
  if (estado_laboral !== 'trabaja') return { tipoTrabajo: null, lugarTrabajo: null };
  return { tipoTrabajo: tipo_trabajo || null, lugarTrabajo: lugar_trabajo || null };
}

// Mismo criterio que pacientes.controller.js: a lo sumo una direccion
// principal.
function validarDirecciones(direcciones) {
  if (direcciones === undefined) return null;
  if (!Array.isArray(direcciones)) return 'direcciones debe ser un arreglo';
  const principales = direcciones.filter((d) => d.es_principal).length;
  if (principales > 1) return 'Solo una direccion puede marcarse como principal';
  return null;
}

async function reemplazarDirecciones(ejecutor, pacienteId, direcciones) {
  await ejecutor.query('delete from direcciones_paciente where paciente_id = $1', [pacienteId]);
  for (const d of direcciones) {
    await ejecutor.query(
      `insert into direcciones_paciente (paciente_id, direccion, google_maps_url, pais, provincia, distrito, corregimiento, comparte_ubicacion, es_principal)
       values ($1,$2,$3,$4,$5,$6,$7, coalesce($8, false), coalesce($9, false))`,
      [pacienteId, d.direccion || null, d.google_maps_url || null, d.pais || null, d.provincia || null, d.distrito || null, d.corregimiento || null, d.comparte_ubicacion, d.es_principal]
    );
  }
}

// La lista de familiares se manda completa en cada guardado -- se
// reemplaza como conjunto, igual que en pacientes.controller.js.
async function reemplazarFamiliares(ejecutor, pacienteId, familiares) {
  await ejecutor.query('delete from familiares_paciente where paciente_id = $1', [pacienteId]);
  for (const f of familiares) {
    if (!f.nombre) continue;
    await ejecutor.query(
      'insert into familiares_paciente (paciente_id, nombre, telefono, parentesco) values ($1,$2,$3,$4)',
      [pacienteId, f.nombre, f.telefono || null, f.parentesco || null]
    );
  }
}

// PUT /api/portal-paciente/perfil -- el paciente edita su propia ficha.
// Deliberadamente NO acepta "identificacion" (cedula, dato de identidad
// que solo corrige el staff). El paciente_id se resuelve de
// req.usuario.id, nunca de un id del body.
async function actualizar(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      nombre, fecha_nacimiento, sexo, telefono, acepta_whatsapp, email,
      estado_civil, estado_laboral, tipo_trabajo, lugar_trabajo,
      direcciones, familiares, alergias, foto,
    } = req.body;

    const errorDirecciones = validarDirecciones(direcciones);
    if (errorDirecciones) return res.status(400).json({ mensaje: errorDirecciones });

    const { tipoTrabajo, lugarTrabajo } = normalizarDatosLaborales(estado_laboral, tipo_trabajo, lugar_trabajo);

    const vinculo = await client.query('select id from pacientes where usuario_id = $1', [req.usuario.id]);
    if (!vinculo.rows[0]) return res.status(404).json({ mensaje: 'No se encontro tu ficha de paciente' });
    const pacienteId = vinculo.rows[0].id;

    await client.query('begin');

    await client.query(
      `update pacientes set
         nombre = coalesce($1, nombre),
         fecha_nacimiento = coalesce($2, fecha_nacimiento),
         sexo = coalesce($3, sexo),
         telefono = coalesce($4, telefono),
         acepta_whatsapp = coalesce($5, acepta_whatsapp),
         email = coalesce($6, email),
         alergias = coalesce($7, alergias),
         foto = coalesce($8, foto),
         estado_civil = coalesce($9, estado_civil),
         estado_laboral = coalesce($10, estado_laboral),
         tipo_trabajo = $11,
         lugar_trabajo = $12
       where id = $13`,
      [
        nombre, fecha_nacimiento || null, sexo || null, telefono, acepta_whatsapp, email,
        alergias, foto,
        estado_civil || null, estado_laboral || null, tipoTrabajo, lugarTrabajo,
        pacienteId,
      ]
    );

    if (direcciones !== undefined) {
      await reemplazarDirecciones(client, pacienteId, direcciones || []);
    }
    if (familiares !== undefined) {
      await reemplazarFamiliares(client, pacienteId, familiares || []);
    }

    await client.query('commit');

    const { rows } = await pool.query(SELECT_PERFIL_COMPLETO, [req.usuario.id]);
    res.json(rows[0]);
  } catch (err) {
    await client.query('rollback');
    next(err);
  } finally {
    client.release();
  }
}

// GET /api/portal-paciente/citas -- historial de consultas de TODAS las
// clinicas donde autorizaron al paciente (con empresa_nombre para
// distinguirlas), mismo shape que pacientes.controller.js#historial (uso
// de staff) para poder reusar el mismo componente de tabla + tabs.
async function citas(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select coalesce(hc.id, c.id) as id, c.id as cita_id, c.empresa_id, e.nombre as empresa_nombre,
              c.paciente_id, c.doctor_id,
              hc.motivo_consulta, hc.diagnostico, hc.tratamiento, hc.notas, hc.created_at,
              c.fecha as fecha_cita, c.hora_inicio as hora_cita, c.hora_fin as hora_fin_cita,
              c.motivo as motivo_cita, c.estado, c.es_domicilio,
              d.nombre as doctor_nombre,
              coalesce(
                (select esp.nombre from especialidades esp where esp.id = c.especialidad_id),
                (select string_agg(esp2.nombre, ', ' order by esp2.nombre)
                 from doctor_especialidades de2 join especialidades esp2 on esp2.id = de2.especialidad_id
                 where de2.doctor_id = d.id)
              ) as especialidad_nombre,
              s.nombre as sucursal_nombre,
              exists(select 1 from recetas r where r.cita_id = c.id) as tiene_receta,
              exists(select 1 from ordenes_laboratorio ol where ol.cita_id = c.id) as tiene_laboratorio,
              (case
                when exists(select 1 from ordenes_laboratorio ol where ol.cita_id = c.id and ol.estado = 'pendiente') then 'pendiente'
                when exists(select 1 from ordenes_laboratorio ol where ol.cita_id = c.id and ol.estado = 'completada') then 'completada'
                when exists(select 1 from ordenes_laboratorio ol where ol.cita_id = c.id and ol.estado = 'cancelada') then 'cancelada'
              end) as estado_laboratorio,
              (c.estado = 'pendiente' and (c.fecha + c.hora_fin) < (now() at time zone coalesce(s.zona_horaria, 'America/Panama'))) as vencida
       from citas c
       join pacientes p on p.id = c.paciente_id
       join doctores d on d.id = c.doctor_id
       join empresas e on e.id = c.empresa_id
       left join sucursales s on s.id = c.sucursal_id
       left join historias_clinicas hc on hc.cita_id = c.id
       where p.usuario_id = $1 and c.empresa_id in ${EMPRESAS_AUTORIZADAS}
       order by c.fecha desc, c.hora_inicio desc`,
      [req.usuario.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// Verifica que la cita sea de ESTE paciente y de una clinica que lo
// autoriza -- devuelve el id interno o null. Se usa antes de cualquiera
// de los 3 detalles por-cita de abajo.
async function citaPropiaAutorizada(usuarioId, citaId) {
  const { rows } = await pool.query(
    `select 1 from citas c
     join pacientes p on p.id = c.paciente_id
     where c.id = $2 and p.usuario_id = $1 and c.empresa_id in ${EMPRESAS_AUTORIZADAS}`,
    [usuarioId, citaId]
  );
  return !!rows[0];
}

// GET /api/portal-paciente/citas/:citaId/signos-vitales
async function signosVitalesDeCita(req, res, next) {
  try {
    if (!(await citaPropiaAutorizada(req.usuario.id, req.params.citaId))) {
      return res.status(404).json({ mensaje: 'Cita no encontrada' });
    }
    const { rows } = await pool.query('select * from signos_vitales where cita_id = $1', [req.params.citaId]);
    if (!rows[0]) return res.status(404).json({ mensaje: 'Esta cita todavia no tiene signos vitales registrados' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

// GET /api/portal-paciente/citas/:citaId/recetas
async function recetasDeCita(req, res, next) {
  try {
    if (!(await citaPropiaAutorizada(req.usuario.id, req.params.citaId))) {
      return res.status(404).json({ mensaje: 'Cita no encontrada' });
    }
    const { rows } = await pool.query(
      'select * from recetas where cita_id = $1 order by created_at asc',
      [req.params.citaId]
    );
    const recetas = await Promise.all(rows.map(async (r) => {
      const medicamentos = await pool.query(
        'select * from receta_medicamentos where receta_id = $1 order by orden asc, created_at asc',
        [r.id]
      );
      return { ...r, medicamentos: medicamentos.rows };
    }));
    res.json(recetas);
  } catch (err) { next(err); }
}

// GET /api/portal-paciente/citas/:citaId/laboratorio
async function laboratorioDeCita(req, res, next) {
  try {
    if (!(await citaPropiaAutorizada(req.usuario.id, req.params.citaId))) {
      return res.status(404).json({ mensaje: 'Cita no encontrada' });
    }
    const { rows } = await pool.query(
      'select * from ordenes_laboratorio where cita_id = $1 order by created_at asc',
      [req.params.citaId]
    );
    const ordenes = await Promise.all(rows.map(async (o) => {
      const examenes = await pool.query(
        'select * from orden_laboratorio_examenes where orden_id = $1 order by orden asc, created_at asc',
        [o.id]
      );
      return { ...o, examenes: examenes.rows };
    }));
    res.json(ordenes);
  } catch (err) { next(err); }
}

// GET /api/portal-paciente/clinicas -- TODAS las clinicas donde el
// paciente tiene expediente (pacientes_empresas), no solo las que lo
// autorizaron al portal (EMPRESAS_AUTORIZADAS es un conjunto distinto y
// mas chico) -- puede tener un expediente en una clinica sin haber sido
// invitado a su portal ahi, y de todas formas debe poder ver/gestionar
// si esta compartiendo su informacion.
async function clinicas(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select e.id as empresa_id, e.nombre as empresa_nombre, pe.activo, pe.comparte_historial_clinico
       from pacientes_empresas pe
       join pacientes p on p.id = pe.paciente_id
       join empresas e on e.id = pe.empresa_id
       where p.usuario_id = $1
       order by e.nombre asc`,
      [req.usuario.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// POST /api/portal-paciente/clinicas/:empresaId/solicitar-revocacion --
// dejar de compartir algo que ya estaba ACTIVO es mas sensible que nunca
// haberlo compartido, asi que exige el mismo tipo de correo+OTP que
// activar el compartir (ver solicitarConsentimiento), aunque el paciente
// ya este autenticado -- ver enviarSolicitudRevocacion. No cambia
// comparte_historial_clinico hasta que confirme el OTP en la pagina
// publica (consentimientoDatos.controller.js#responder), que ademas
// dispara la notificacion final (a la clinica + super-admin, con copia
// al paciente).
async function solicitarRevocacion(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select p.id as paciente_id, p.nombre, p.identificacion, p.email,
              e.id as empresa_id, e.nombre as empresa_nombre, e.email as empresa_email
       from pacientes p
       join pacientes_empresas pe on pe.paciente_id = p.id and pe.empresa_id = $2
       join empresas e on e.id = pe.empresa_id
       where p.usuario_id = $1`,
      [req.usuario.id, req.params.empresaId]
    );
    const registro = rows[0];
    if (!registro) return res.status(404).json({ mensaje: 'No tienes expediente en esa clinica' });
    if (!registro.email) return res.status(400).json({ mensaje: 'No tienes un correo registrado para recibir la confirmacion' });

    try {
      await enviarSolicitudRevocacion({
        pacienteId: registro.paciente_id,
        empresaId: registro.empresa_id,
        paciente: registro,
        empresa: { nombre: registro.empresa_nombre, email: registro.empresa_email },
      });
    } catch (err) {
      return res.status(502).json({ mensaje: 'No se pudo enviar el correo de confirmacion. Intenta de nuevo.' });
    }

    res.json({ mensaje: 'Te enviamos un correo para confirmar que quieres dejar de compartir.' });
  } catch (err) { next(err); }
}

// POST /api/portal-paciente/clinicas/:empresaId/solicitar-consentimiento
// -- activar el compartir es la accion mas sensible (autoriza a otras
// clinicas a ver su historial), asi que exige el MISMO flujo de
// correo+token+OTP que cuando lo pide el staff, sin importar quien lo
// inicia -- ver solicitudConsentimiento.js y
// pacientes.controller.js#solicitarConsentimientoDatos. El correo llega
// al propio correo del paciente (no cambia comparte_historial_clinico
// hasta que confirme el click + OTP en la pagina publica).
async function solicitarConsentimiento(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select p.id as paciente_id, p.nombre, p.identificacion, p.email,
              e.id as empresa_id, e.nombre as empresa_nombre, e.email as empresa_email, e.telefono as empresa_telefono
       from pacientes p
       join pacientes_empresas pe on pe.paciente_id = p.id and pe.empresa_id = $2
       join empresas e on e.id = pe.empresa_id
       where p.usuario_id = $1`,
      [req.usuario.id, req.params.empresaId]
    );
    const registro = rows[0];
    if (!registro) return res.status(404).json({ mensaje: 'No tienes expediente en esa clinica' });
    if (!registro.email) return res.status(400).json({ mensaje: 'No tienes un correo registrado para recibir el consentimiento' });

    try {
      await enviarSolicitudConsentimiento({
        pacienteId: registro.paciente_id,
        empresaId: registro.empresa_id,
        paciente: registro,
        empresa: { nombre: registro.empresa_nombre, email: registro.empresa_email, telefono: registro.empresa_telefono },
      });
    } catch (err) {
      return res.status(502).json({ mensaje: 'No se pudo enviar el correo de consentimiento. Intenta de nuevo.' });
    }

    res.json({ mensaje: 'Te enviamos un correo para confirmar el compartir de tu informacion.' });
  } catch (err) { next(err); }
}

module.exports = { perfil, actualizar, citas, signosVitalesDeCita, recetasDeCita, laboratorioDeCita, clinicas, solicitarRevocacion, solicitarConsentimiento };
