const { pool } = require('../config/db');
const { registrarEventoCampana, registrarEventosCampana, primerEventoLogCampana } = require('../utils/campanaLog');
const { hayCitaConflictivaConCampana, hayOtraCampanaConflictiva } = require('../utils/choqueCampana');

// Transiciones de estado permitidas -- ver DISENO-CAMPANAS-MEDICAS.md
// seccion 7 (diagrama de estados). Cualquier otro salto se rechaza.
const TRANSICIONES = {
  borrador: ['pendiente_aprobacion'],
  pendiente_aprobacion: ['aprobada', 'rechazada'],
  rechazada: ['borrador'],
  aprobada: ['en_curso', 'cancelada'],
  en_curso: ['finalizada', 'cancelada'],
  finalizada: [],
  cancelada: [],
};

// GET /api/campanas?estado=&sucursal_id=
async function listar(req, res, next) {
  try {
    const { estado, sucursal_id } = req.query;
    const condiciones = ['c.empresa_id = $1'];
    const valores = [req.empresaId];
    if (estado) { valores.push(estado); condiciones.push(`c.estado = $${valores.length}`); }
    if (sucursal_id) { valores.push(sucursal_id); condiciones.push(`c.sucursal_id = $${valores.length}`); }

    const { rows } = await pool.query(
      `select c.*, s.nombre as sucursal_nombre,
              (select count(*) from campana_doctores cd where cd.campana_id = c.id) as doctores_invitados,
              (select count(*) from campana_doctores cd where cd.campana_id = c.id and cd.estado = 'confirmado') as doctores_confirmados
       from campanas c
       left join sucursales s on s.id = c.sucursal_id
       where ${condiciones.join(' and ')}
       order by c.fecha_inicio desc`,
      valores
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// GET /api/campanas/:id
async function obtener(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select c.*, s.nombre as sucursal_nombre
       from campanas c
       left join sucursales s on s.id = c.sucursal_id
       where c.id = $1 and c.empresa_id = $2`,
      [req.params.id, req.empresaId]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Campana no encontrada' });

    const doctores = await pool.query(
      `select cd.id, cd.doctor_id, cd.estado, cd.notas, d.nombre as doctor_nombre,
              (select string_agg(esp.nombre, ', ' order by esp.nombre)
               from doctor_especialidades de join especialidades esp on esp.id = de.especialidad_id
               where de.doctor_id = d.id) as especialidad_nombre,
              d.telefono as doctor_telefono, d.acepta_whatsapp as doctor_acepta_whatsapp
       from campana_doctores cd
       join doctores d on d.id = cd.doctor_id
       where cd.campana_id = $1
       order by d.nombre asc`,
      [req.params.id]
    );

    res.json({ ...rows[0], doctores: doctores.rows });
  } catch (err) { next(err); }
}

// POST /api/campanas
async function crear(req, res, next) {
  try {
    const {
      sucursal_id, nombre, lugar, contacto_lugar, google_maps_url, fecha_inicio, fecha_fin,
      hora_inicio, hora_fin, descripcion,
    } = req.body;

    if (!nombre || !lugar || !fecha_inicio || !fecha_fin) {
      return res.status(400).json({ mensaje: 'nombre, lugar, fecha_inicio y fecha_fin son requeridos' });
    }
    if (fecha_fin < fecha_inicio) {
      return res.status(400).json({ mensaje: 'La fecha de fin no puede ser anterior a la fecha de inicio.' });
    }

    if (sucursal_id) {
      const sucursal = await pool.query('select 1 from sucursales where id = $1 and empresa_id = $2', [sucursal_id, req.empresaId]);
      if (!sucursal.rows[0]) return res.status(400).json({ mensaje: 'La sucursal indicada no pertenece a esta clinica' });
    }

    const log = primerEventoLogCampana(req.usuario?.nombre, 'Campana creada');
    const { rows } = await pool.query(
      `insert into campanas (empresa_id, sucursal_id, nombre, lugar, contacto_lugar, google_maps_url, fecha_inicio, fecha_fin, hora_inicio, hora_fin, descripcion, creado_por, log)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) returning *`,
      [req.empresaId, sucursal_id || null, nombre, lugar, contacto_lugar, google_maps_url || null, fecha_inicio, fecha_fin, hora_inicio || null, hora_fin || null, descripcion, req.usuario?.id, log]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

// PUT /api/campanas/:id
// Solo se puede editar libremente en 'borrador' o 'rechazada' -- una vez
// enviada a revision (pendiente_aprobacion) o resuelta, quien aprueba debe
// ver siempre la version final (ver DISENO-CAMPANAS-MEDICAS.md seccion 7).
async function actualizar(req, res, next) {
  try {
    const actual = await pool.query('select * from campanas where id = $1 and empresa_id = $2', [req.params.id, req.empresaId]);
    if (!actual.rows[0]) return res.status(404).json({ mensaje: 'Campana no encontrada' });
    const campana = actual.rows[0];

    // La ubicacion (google_maps_url) queda exenta del candado de edicion:
    // es informacion operativa (a donde llegar), no una condicion de la
    // campana que quien aprueba necesite ver "congelada" -- se puede
    // completar o corregir en cualquier estado. El resto de los campos
    // solo se puede editar libremente en borrador/rechazada.
    const soloUbicacion = Object.keys(req.body).every((k) => k === 'google_maps_url');
    if (!soloUbicacion && !['borrador', 'rechazada'].includes(campana.estado)) {
      return res.status(409).json({ mensaje: `No se puede editar una campana en estado '${campana.estado}'.` });
    }

    const {
      sucursal_id, nombre, lugar, contacto_lugar, google_maps_url, fecha_inicio, fecha_fin,
      hora_inicio, hora_fin, descripcion,
    } = req.body;

    const nuevaFechaInicio = fecha_inicio || campana.fecha_inicio;
    const nuevaFechaFin = fecha_fin || campana.fecha_fin;
    if (nuevaFechaFin < nuevaFechaInicio) {
      return res.status(400).json({ mensaje: 'La fecha de fin no puede ser anterior a la fecha de inicio.' });
    }

    if (sucursal_id) {
      const sucursal = await pool.query('select 1 from sucursales where id = $1 and empresa_id = $2', [sucursal_id, req.empresaId]);
      if (!sucursal.rows[0]) return res.status(400).json({ mensaje: 'La sucursal indicada no pertenece a esta clinica' });
    }

    const { rows } = await pool.query(
      `update campanas set
         sucursal_id = coalesce($1, sucursal_id),
         nombre = coalesce($2, nombre),
         lugar = coalesce($3, lugar),
         contacto_lugar = coalesce($4, contacto_lugar),
         google_maps_url = coalesce($5, google_maps_url),
         fecha_inicio = coalesce($6, fecha_inicio),
         fecha_fin = coalesce($7, fecha_fin),
         hora_inicio = $8,
         hora_fin = $9,
         descripcion = coalesce($10, descripcion)
       where id = $11 and empresa_id = $12 returning *`,
      [sucursal_id, nombre, lugar, contacto_lugar, google_maps_url, fecha_inicio, fecha_fin, hora_inicio || null, hora_fin || null, descripcion, req.params.id, req.empresaId]
    );

    await registrarEventoCampana(pool, req.params.id, req.usuario?.nombre, 'Campana actualizada');
    res.json(rows[0]);
  } catch (err) { next(err); }
}

// PUT /api/campanas/:id/estado  { estado, motivo_rechazo? }
async function cambiarEstado(req, res, next) {
  try {
    const { estado, motivo_rechazo } = req.body;
    if (!estado) return res.status(400).json({ mensaje: 'estado es requerido' });

    const actual = await pool.query('select * from campanas where id = $1 and empresa_id = $2', [req.params.id, req.empresaId]);
    if (!actual.rows[0]) return res.status(404).json({ mensaje: 'Campana no encontrada' });
    const campana = actual.rows[0];

    const permitidos = TRANSICIONES[campana.estado] || [];
    if (!permitidos.includes(estado)) {
      return res.status(409).json({ mensaje: `No se puede pasar de '${campana.estado}' a '${estado}'.` });
    }
    if (estado === 'rechazada' && !motivo_rechazo) {
      return res.status(400).json({ mensaje: 'motivo_rechazo es requerido para rechazar una campana' });
    }

    const esAprobacion = estado === 'aprobada';
    const { rows } = await pool.query(
      `update campanas set
         estado = $1,
         motivo_rechazo = case when $1 = 'rechazada' then $2 else motivo_rechazo end,
         aprobado_por = case when $3 then $4 else aprobado_por end,
         fecha_aprobacion = case when $3 then now() else fecha_aprobacion end
       where id = $5 and empresa_id = $6 returning *`,
      [estado, motivo_rechazo || null, esAprobacion, req.usuario?.id, req.params.id, req.empresaId]
    );

    await registrarEventoCampana(
      pool, req.params.id, req.usuario?.nombre, 'Estado',
      campana.estado, estado + (motivo_rechazo ? ` (${motivo_rechazo})` : '')
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
}

// ---------- Reclutamiento de doctores ----------

// GET /api/campanas/:id/doctores
async function listarDoctores(req, res, next) {
  try {
    const campana = await pool.query('select 1 from campanas where id = $1 and empresa_id = $2', [req.params.id, req.empresaId]);
    if (!campana.rows[0]) return res.status(404).json({ mensaje: 'Campana no encontrada' });

    const { rows } = await pool.query(
      `select cd.id, cd.doctor_id, cd.estado, cd.notas, d.nombre as doctor_nombre,
              (select string_agg(esp.nombre, ', ' order by esp.nombre)
               from doctor_especialidades de join especialidades esp on esp.id = de.especialidad_id
               where de.doctor_id = d.id) as especialidad_nombre,
              d.telefono as doctor_telefono, d.acepta_whatsapp as doctor_acepta_whatsapp
       from campana_doctores cd
       join doctores d on d.id = cd.doctor_id
       where cd.campana_id = $1
       order by d.nombre asc`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// POST /api/campanas/:id/doctores  { doctor_id, notas? }
async function invitarDoctor(req, res, next) {
  try {
    const { doctor_id, notas } = req.body;
    if (!doctor_id) return res.status(400).json({ mensaje: 'doctor_id es requerido' });

    const campana = await pool.query('select 1 from campanas where id = $1 and empresa_id = $2', [req.params.id, req.empresaId]);
    if (!campana.rows[0]) return res.status(404).json({ mensaje: 'Campana no encontrada' });

    const doctor = await pool.query(
      `select d.id, d.nombre from doctores d
       join doctores_empresas de on de.doctor_id = d.id
       where d.id = $1 and de.empresa_id = $2`,
      [doctor_id, req.empresaId]
    );
    if (!doctor.rows[0]) return res.status(400).json({ mensaje: 'El doctor indicado no pertenece a esta clinica' });

    const { rows } = await pool.query(
      `insert into campana_doctores (campana_id, doctor_id, notas)
       values ($1,$2,$3)
       on conflict (campana_id, doctor_id) do update set notas = excluded.notas
       returning *`,
      [req.params.id, doctor_id, notas || null]
    );
    await registrarEventoCampana(pool, req.params.id, req.usuario?.nombre, 'Doctor invitado', null, doctor.rows[0].nombre);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

// PUT /api/campanas/:id/doctores/:doctorId  { estado, notas? }
async function actualizarDoctor(req, res, next) {
  try {
    const { estado, notas } = req.body;
    if (estado && !['invitado', 'confirmado', 'rechazado'].includes(estado)) {
      return res.status(400).json({ mensaje: 'Estado invalido' });
    }

    // Al confirmar, el doctor queda "ocupado" para toda la ventana de la
    // campana -- no se puede confirmar si ya tiene una cita o esta
    // confirmado en otra campana que se cruce con ese periodo. Ver
    // DISENO-CAMPANAS-MEDICAS.md seccion 9.
    if (estado === 'confirmado') {
      const campana = await pool.query(
        'select fecha_inicio, fecha_fin, hora_inicio, hora_fin from campanas where id = $1 and empresa_id = $2',
        [req.params.id, req.empresaId]
      );
      if (!campana.rows[0]) return res.status(404).json({ mensaje: 'Campana no encontrada' });
      const { fecha_inicio, fecha_fin, hora_inicio, hora_fin } = campana.rows[0];

      const choqueCita = await hayCitaConflictivaConCampana({
        doctorId: req.params.doctorId, campanaId: req.params.id,
        fechaInicio: fecha_inicio, fechaFin: fecha_fin, horaInicio: hora_inicio, horaFin: hora_fin,
      });
      if (choqueCita) {
        return res.status(409).json({ mensaje: 'El doctor ya tiene una cita agendada que se cruza con la ventana de esta campana.' });
      }

      const choqueOtraCampana = await hayOtraCampanaConflictiva({
        doctorId: req.params.doctorId, campanaId: req.params.id,
        fechaInicio: fecha_inicio, fechaFin: fecha_fin, horaInicio: hora_inicio, horaFin: hora_fin,
      });
      if (choqueOtraCampana) {
        return res.status(409).json({ mensaje: 'El doctor ya esta confirmado en otra campana que se cruza con esta ventana.' });
      }
    }

    const { rows } = await pool.query(
      `update campana_doctores set
         estado = coalesce($1, estado),
         notas = coalesce($2, notas)
       where campana_id = $3 and doctor_id = $4 returning *`,
      [estado, notas, req.params.id, req.params.doctorId]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'El doctor no esta invitado a esta campana' });

    if (estado) {
      const doctor = await pool.query('select nombre from doctores where id = $1', [req.params.doctorId]);
      await registrarEventoCampana(pool, req.params.id, req.usuario?.nombre, `Doctor ${doctor.rows[0]?.nombre || ''}`.trim(), null, estado);
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
}

// DELETE /api/campanas/:id/doctores/:doctorId
async function quitarDoctor(req, res, next) {
  try {
    const { rowCount } = await pool.query(
      'delete from campana_doctores where campana_id = $1 and doctor_id = $2',
      [req.params.id, req.params.doctorId]
    );
    if (!rowCount) return res.status(404).json({ mensaje: 'El doctor no esta invitado a esta campana' });
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = {
  listar, obtener, crear, actualizar, cambiarEstado,
  listarDoctores, invitarDoctor, actualizarDoctor, quitarDoctor,
};
