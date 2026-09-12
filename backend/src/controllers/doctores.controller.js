const { pool } = require('../config/db');

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

    const { rows } = await pool.query('select * from doctores where identificacion = $1', [identificacion]);
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
    const { nombre, identificacion, especialidades, telefono, acepta_whatsapp, email, activo } = req.body;

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
        `insert into doctores (nombre, identificacion, telefono, acepta_whatsapp, email)
         values ($1,$2,$3, coalesce($4, false),$5) returning *`,
        [nombre, identificacion || null, telefono, acepta_whatsapp, email]
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
    const { nombre, identificacion, especialidades, telefono, acepta_whatsapp, email, activo } = req.body;

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
           email = coalesce($5, email)
         where id = $6
       )
       update doctores_empresas set activo = coalesce($7, activo) where doctor_id = $6 and empresa_id = $8`,
      [nombre, identificacion, telefono, acepta_whatsapp, email, req.params.id, activo, req.empresaId]
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

module.exports = { listar, obtener, buscarPorIdentificacion, crear, actualizar, eliminar };
