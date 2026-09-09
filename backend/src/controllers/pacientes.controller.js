const { pool } = require('../config/db');

// Un paciente puede tener varias direcciones (tabla puente
// direcciones_paciente), una marcada como principal -- esa es la que usan
// Google Maps/Waze/WhatsApp al doctor en Citas/historial. Se agregan como
// json_agg, ordenadas con la principal primero.
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

// GET /api/pacientes
async function listar(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select p.*, pe.activo, ${SELECT_DIRECCIONES}
       from pacientes p
       join pacientes_empresas pe on pe.paciente_id = p.id
       where pe.empresa_id = $1
       order by p.nombre asc`,
      [req.empresaId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function obtener(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select p.*, pe.activo, ${SELECT_DIRECCIONES}
       from pacientes p
       join pacientes_empresas pe on pe.paciente_id = p.id
       where p.id = $1 and pe.empresa_id = $2`,
      [req.params.id, req.empresaId]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Paciente no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

// Valida que a lo sumo una direccion venga marcada como principal --
// mismo limite que ya impone el indice unico parcial en la base de datos,
// pero devolver un 400 claro es mejor que dejar que explote el insert.
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

// GET /api/pacientes/buscar?identificacion=X
// Busca un paciente en TODA la red (no solo en esta clinica), para saber
// si ya existe antes de crear uno nuevo -- mismo patron que
// usuarios.buscarPorEmail. No revela si ya esta vinculado a otra clinica,
// solo que la persona ya existe en la plataforma.
async function buscarPorIdentificacion(req, res, next) {
  try {
    const identificacion = (req.query.identificacion || '').trim();
    if (!identificacion) return res.status(400).json({ mensaje: 'identificacion es requerida' });

    const { rows } = await pool.query('select * from pacientes where identificacion = $1', [identificacion]);
    if (!rows[0]) return res.json({ existe: false });
    res.json({ existe: true, paciente: rows[0] });
  } catch (err) { next(err); }
}

// POST /api/pacientes
// Si ya existe un paciente con esa identificacion en la red, no se
// duplica: se reutiliza el registro global y solo se crea el vinculo con
// esta clinica (pacientes_empresas). Si no existe, se crea de cero.
async function crear(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      nombre, identificacion, fecha_nacimiento, sexo, telefono, acepta_whatsapp, email,
      direcciones, contacto_emergencia, alergias, activo, foto,
    } = req.body;

    const errorDirecciones = validarDirecciones(direcciones);
    if (errorDirecciones) return res.status(400).json({ mensaje: errorDirecciones });

    await client.query('begin');

    let paciente = null;
    if (identificacion) {
      const r = await client.query('select * from pacientes where identificacion = $1', [identificacion]);
      paciente = r.rows[0] || null;
    }

    if (paciente) {
      const yaVinculado = await client.query(
        'select 1 from pacientes_empresas where paciente_id = $1 and empresa_id = $2',
        [paciente.id, req.empresaId]
      );
      if (yaVinculado.rows[0]) {
        await client.query('rollback');
        return res.status(409).json({ mensaje: `${paciente.nombre} ya esta registrado en esta clinica.` });
      }
    } else {
      if (!nombre) {
        await client.query('rollback');
        return res.status(400).json({ mensaje: 'nombre es requerido para un paciente nuevo' });
      }
      const ins = await client.query(
        `insert into pacientes (nombre, identificacion, fecha_nacimiento, sexo, telefono, acepta_whatsapp, email, contacto_emergencia, alergias, foto)
         values ($1,$2,$3,$4,$5, coalesce($6, false),$7,$8,$9,$10) returning *`,
        [
          nombre, identificacion || null, fecha_nacimiento || null, sexo, telefono, acepta_whatsapp, email,
          contacto_emergencia ? JSON.stringify(contacto_emergencia) : null, alergias, foto || null,
        ]
      );
      paciente = ins.rows[0];
      if (Array.isArray(direcciones) && direcciones.length) {
        await reemplazarDirecciones(client, paciente.id, direcciones);
      }
    }

    await client.query(
      `insert into pacientes_empresas (paciente_id, empresa_id, activo) values ($1, $2, coalesce($3, true))`,
      [paciente.id, req.empresaId, activo]
    );

    await client.query('commit');

    const { rows } = await pool.query(
      `select p.*, pe.activo, ${SELECT_DIRECCIONES}
       from pacientes p join pacientes_empresas pe on pe.paciente_id = p.id and pe.empresa_id = $2
       where p.id = $1`,
      [paciente.id, req.empresaId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('rollback');
    if (err.code === '23505') return res.status(409).json({ mensaje: 'Ya existe un paciente con esa identificacion.' });
    next(err);
  } finally {
    client.release();
  }
}

// PUT /api/pacientes/:id
// Actualiza los datos globales de la persona (nombre, contacto, alergias,
// etc.) y, si viene "activo", el estado de la relacion con ESTA clinica
// puntual (no afecta su estado en otras clinicas).
async function actualizar(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      nombre, identificacion, fecha_nacimiento, sexo, telefono, acepta_whatsapp, email,
      direcciones, contacto_emergencia, alergias, activo, foto,
    } = req.body;

    const errorDirecciones = validarDirecciones(direcciones);
    if (errorDirecciones) return res.status(400).json({ mensaje: errorDirecciones });

    const vinculo = await client.query(
      'select 1 from pacientes_empresas where paciente_id = $1 and empresa_id = $2',
      [req.params.id, req.empresaId]
    );
    if (!vinculo.rows[0]) return res.status(404).json({ mensaje: 'Paciente no encontrado' });

    await client.query('begin');

    const { rows } = await client.query(
      `update pacientes set
         nombre = coalesce($1, nombre),
         identificacion = coalesce($2, identificacion),
         fecha_nacimiento = coalesce($3, fecha_nacimiento),
         sexo = coalesce($4, sexo),
         telefono = coalesce($5, telefono),
         acepta_whatsapp = coalesce($6, acepta_whatsapp),
         email = coalesce($7, email),
         contacto_emergencia = coalesce($8, contacto_emergencia),
         alergias = coalesce($9, alergias),
         foto = coalesce($10, foto)
       where id = $11 returning *`,
      [
        nombre, identificacion, fecha_nacimiento || null, sexo, telefono, acepta_whatsapp, email,
        contacto_emergencia ? JSON.stringify(contacto_emergencia) : null, alergias, foto,
        req.params.id,
      ]
    );

    if (direcciones !== undefined) {
      await reemplazarDirecciones(client, req.params.id, direcciones || []);
    }

    if (activo !== undefined) {
      await client.query(
        'update pacientes_empresas set activo = $1 where paciente_id = $2 and empresa_id = $3',
        [activo, req.params.id, req.empresaId]
      );
    }

    await client.query('commit');

    const { rows: final } = await pool.query(
      `select p.*, pe.activo, ${SELECT_DIRECCIONES}
       from pacientes p join pacientes_empresas pe on pe.paciente_id = p.id and pe.empresa_id = $2
       where p.id = $1`,
      [req.params.id, req.empresaId]
    );
    res.json(final[0] || rows[0]);
  } catch (err) {
    await client.query('rollback');
    if (err.code === '23505') return res.status(409).json({ mensaje: 'Ya existe un paciente con esa identificacion.' });
    next(err);
  } finally {
    client.release();
  }
}

// DELETE /api/pacientes/:id
// Desvincula al paciente de ESTA clinica. No borra su identidad global ni
// su historial en otras clinicas donde este vinculado.
async function eliminar(req, res, next) {
  try {
    const vinculo = await pool.query(
      'select 1 from pacientes_empresas where paciente_id = $1 and empresa_id = $2',
      [req.params.id, req.empresaId]
    );
    if (!vinculo.rows[0]) return res.status(404).json({ mensaje: 'Paciente no encontrado' });

    // No se puede desvincular a un paciente que ya tiene citas en esta
    // clinica: quedarian huerfanas (historias/recetas/laboratorio cuelgan
    // de la cita, no del vinculo) -- el historial() de mas abajo exige el
    // vinculo activo para mostrarse, asi que desvincular las dejaria
    // inaccesibles desde la UI aunque sigan existiendo en la base de datos.
    const tieneCitas = await pool.query(
      'select 1 from citas where paciente_id = $1 and empresa_id = $2 limit 1',
      [req.params.id, req.empresaId]
    );
    if (tieneCitas.rows[0]) {
      return res.status(409).json({ mensaje: 'No se puede eliminar: este paciente ya tiene citas registradas en esta clinica.' });
    }

    await pool.query('delete from pacientes_empresas where paciente_id = $1 and empresa_id = $2', [req.params.id, req.empresaId]);
    res.status(204).send();
  } catch (err) { next(err); }
}

// GET /api/pacientes/:id/historial  -> citas del paciente EN ESTA CLINICA, con su
// historia clinica si ya se registro (puede no existir todavia: signos vitales,
// recetas y ordenes de laboratorio se pueden cargar antes de que el doctor
// escriba la consulta, y la cita no debe desaparecer de esta lista por eso).
async function historial(req, res, next) {
  try {
    const vinculo = await pool.query(
      'select 1 from pacientes_empresas where paciente_id = $1 and empresa_id = $2',
      [req.params.id, req.empresaId]
    );
    if (!vinculo.rows[0]) return res.status(404).json({ mensaje: 'Paciente no encontrado' });

    const { rows } = await pool.query(
      `select coalesce(hc.id, c.id) as id, c.id as cita_id, c.empresa_id, c.paciente_id, c.doctor_id,
              hc.motivo_consulta, hc.diagnostico, hc.tratamiento, hc.notas, hc.created_at,
              c.fecha as fecha_cita, c.hora_inicio as hora_cita, c.hora_fin as hora_fin_cita,
              c.motivo as motivo_cita, c.estado, c.es_domicilio,
              d.nombre as doctor_nombre, d.telefono as doctor_telefono, d.acepta_whatsapp as doctor_acepta_whatsapp,
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
              end) as estado_laboratorio
       from citas c
       join doctores d on d.id = c.doctor_id
       left join sucursales s on s.id = c.sucursal_id
       left join historias_clinicas hc on hc.cita_id = c.id
       where c.paciente_id = $1 and c.empresa_id = $2
       order by c.fecha desc, c.hora_inicio desc`,
      [req.params.id, req.empresaId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// GET /api/pacientes/:id/signos-vitales-historial -> todos los signos
// vitales del paciente EN ESTA CLINICA, ordenados cronologicamente. Sirve
// para calcular tendencias (ej. subio/bajo de peso respecto a la consulta
// anterior) sin tener que pedir cita por cita.
async function signosVitalesHistorial(req, res, next) {
  try {
    const vinculo = await pool.query(
      'select 1 from pacientes_empresas where paciente_id = $1 and empresa_id = $2',
      [req.params.id, req.empresaId]
    );
    if (!vinculo.rows[0]) return res.status(404).json({ mensaje: 'Paciente no encontrado' });

    const { rows } = await pool.query(
      `select sv.*, c.fecha as fecha_cita, c.hora_inicio as hora_cita
       from signos_vitales sv
       join citas c on c.id = sv.cita_id
       where sv.paciente_id = $1 and sv.empresa_id = $2
       order by c.fecha asc, c.hora_inicio asc`,
      [req.params.id, req.empresaId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// GET /api/pacientes/:id/laboratorio-historial -> todas las ordenes de
// laboratorio del paciente EN ESTA CLINICA (de cualquier cita), para
// mostrarlas en un solo lugar sin tener que abrir cita por cita.
async function laboratorioHistorial(req, res, next) {
  try {
    const vinculo = await pool.query(
      'select 1 from pacientes_empresas where paciente_id = $1 and empresa_id = $2',
      [req.params.id, req.empresaId]
    );
    if (!vinculo.rows[0]) return res.status(404).json({ mensaje: 'Paciente no encontrado' });

    const { rows } = await pool.query(
      `select ol.*, c.fecha as fecha_cita, c.hora_inicio as hora_cita, d.nombre as doctor_nombre
       from ordenes_laboratorio ol
       join citas c on c.id = ol.cita_id
       join doctores d on d.id = ol.doctor_id
       where ol.paciente_id = $1 and ol.empresa_id = $2
       order by c.fecha desc, c.hora_inicio desc`,
      [req.params.id, req.empresaId]
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

// GET /api/pacientes/:id/recetas-historial -> todas las recetas del
// paciente EN ESTA CLINICA (de cualquier cita), para mostrarlas en un
// solo lugar sin tener que abrir cita por cita.
async function recetasHistorial(req, res, next) {
  try {
    const vinculo = await pool.query(
      'select 1 from pacientes_empresas where paciente_id = $1 and empresa_id = $2',
      [req.params.id, req.empresaId]
    );
    if (!vinculo.rows[0]) return res.status(404).json({ mensaje: 'Paciente no encontrado' });

    const { rows } = await pool.query(
      `select r.*, c.fecha as fecha_cita, c.hora_inicio as hora_cita, d.nombre as doctor_nombre
       from recetas r
       join citas c on c.id = r.cita_id
       join doctores d on d.id = r.doctor_id
       where r.paciente_id = $1 and r.empresa_id = $2
       order by c.fecha desc, c.hora_inicio desc`,
      [req.params.id, req.empresaId]
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

module.exports = { listar, obtener, crear, actualizar, eliminar, historial, buscarPorIdentificacion, signosVitalesHistorial, laboratorioHistorial, recetasHistorial };
