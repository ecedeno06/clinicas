const { pool } = require('../config/db');

const DURACION_SLOT_MINUTOS = 30;

function aMinutos(horaTexto) {
  const [h, m] = horaTexto.split(':').map(Number);
  return h * 60 + m;
}

function aTexto(minutos) {
  const h = Math.floor(minutos / 60).toString().padStart(2, '0');
  const m = (minutos % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

// Resta los intervalos ocupados de un bloque libre, devolviendo los
// sub-intervalos que quedan disponibles (puede partir el bloque en varios).
function restarOcupados(bloque, ocupados) {
  let libres = [{ inicio: bloque.inicio, fin: bloque.fin }];
  for (const ocupado of ocupados) {
    const siguiente = [];
    for (const libre of libres) {
      if (ocupado.fin <= libre.inicio || ocupado.inicio >= libre.fin) {
        siguiente.push(libre);
        continue;
      }
      if (ocupado.inicio > libre.inicio) siguiente.push({ inicio: libre.inicio, fin: ocupado.inicio });
      if (ocupado.fin < libre.fin) siguiente.push({ inicio: ocupado.fin, fin: libre.fin });
    }
    libres = siguiente;
  }
  return libres;
}

async function verificarDoctorDeLaEmpresa(doctorId, empresaId) {
  const { rows } = await pool.query('select id from doctores where id = $1 and empresa_id = $2', [doctorId, empresaId]);
  return !!rows[0];
}

// Evita que un mismo doctor tenga dos bloques que se crucen el mismo dia.
async function hayChoqueDeBloque({ doctorId, diaSemana, horaInicio, horaFin, excluirId }) {
  const valores = [doctorId, diaSemana, horaFin, horaInicio];
  let exclusion = '';
  if (excluirId) {
    valores.push(excluirId);
    exclusion = `and id <> $${valores.length}`;
  }
  const { rows } = await pool.query(
    `select 1 from doctor_horarios
     where doctor_id = $1 and dia_semana = $2 and activo = true
       and hora_inicio < $3 and hora_fin > $4
       ${exclusion}
     limit 1`,
    valores
  );
  return !!rows[0];
}

// GET /api/doctores/:doctorId/horarios
async function listarPorDoctor(req, res, next) {
  try {
    if (!(await verificarDoctorDeLaEmpresa(req.params.doctorId, req.empresaId))) {
      return res.status(404).json({ mensaje: 'Doctor no encontrado' });
    }
    const { rows } = await pool.query(
      `select * from doctor_horarios where doctor_id = $1 and activo = true order by dia_semana asc, hora_inicio asc`,
      [req.params.doctorId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

// POST /api/doctores/:doctorId/horarios
async function crear(req, res, next) {
  try {
    const { dia_semana, hora_inicio, hora_fin } = req.body;
    if (dia_semana == null || !hora_inicio || !hora_fin) {
      return res.status(400).json({ mensaje: 'dia_semana, hora_inicio y hora_fin son requeridos' });
    }
    if (hora_fin <= hora_inicio) {
      return res.status(400).json({ mensaje: 'La hora de fin debe ser posterior a la hora de inicio.' });
    }
    if (!(await verificarDoctorDeLaEmpresa(req.params.doctorId, req.empresaId))) {
      return res.status(404).json({ mensaje: 'Doctor no encontrado' });
    }

    const choque = await hayChoqueDeBloque({ doctorId: req.params.doctorId, diaSemana: dia_semana, horaInicio: hora_inicio, horaFin: hora_fin });
    if (choque) {
      return res.status(409).json({ mensaje: 'Ese bloque se cruza con otro horario ya registrado para ese dia.' });
    }

    const { rows } = await pool.query(
      `insert into doctor_horarios (doctor_id, dia_semana, hora_inicio, hora_fin)
       values ($1,$2,$3,$4) returning *`,
      [req.params.doctorId, dia_semana, hora_inicio, hora_fin]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23514') return res.status(400).json({ mensaje: 'Dia u horario fuera de rango.' });
    next(err);
  }
}

// PUT /api/doctores/horarios/:id
async function actualizar(req, res, next) {
  try {
    const { dia_semana, hora_inicio, hora_fin, activo } = req.body;

    const actual = await pool.query(
      `select dh.* from doctor_horarios dh join doctores d on d.id = dh.doctor_id
       where dh.id = $1 and d.empresa_id = $2`,
      [req.params.id, req.empresaId]
    );
    if (!actual.rows[0]) return res.status(404).json({ mensaje: 'Horario no encontrado' });
    const horario = actual.rows[0];

    const nuevoDia = dia_semana ?? horario.dia_semana;
    const nuevoInicio = hora_inicio || horario.hora_inicio;
    const nuevoFin = hora_fin || horario.hora_fin;
    if (nuevoFin <= nuevoInicio) {
      return res.status(400).json({ mensaje: 'La hora de fin debe ser posterior a la hora de inicio.' });
    }

    const choque = await hayChoqueDeBloque({ doctorId: horario.doctor_id, diaSemana: nuevoDia, horaInicio: nuevoInicio, horaFin: nuevoFin, excluirId: horario.id });
    if (choque) {
      return res.status(409).json({ mensaje: 'Ese bloque se cruza con otro horario ya registrado para ese dia.' });
    }

    const { rows } = await pool.query(
      `update doctor_horarios set
         dia_semana = coalesce($1, dia_semana),
         hora_inicio = coalesce($2, hora_inicio),
         hora_fin = coalesce($3, hora_fin),
         activo = coalesce($4, activo)
       where id = $5 returning *`,
      [dia_semana, hora_inicio, hora_fin, activo, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23514') return res.status(400).json({ mensaje: 'Dia u horario fuera de rango.' });
    next(err);
  }
}

// DELETE /api/doctores/horarios/:id
async function eliminar(req, res, next) {
  try {
    const { rowCount } = await pool.query(
      `delete from doctor_horarios where id = $1 and doctor_id in (select id from doctores where empresa_id = $2)`,
      [req.params.id, req.empresaId]
    );
    if (!rowCount) return res.status(404).json({ mensaje: 'Horario no encontrado' });
    res.status(204).send();
  } catch (err) { next(err); }
}

// GET /api/doctores/:id/disponibilidad?fecha=YYYY-MM-DD
// Calcula, para ese doctor y esa fecha, los bloques en que atiende segun su
// horario semanal, las citas ya agendadas ese dia, y las franjas libres
// resultantes (en incrementos de DURACION_SLOT_MINUTOS) para elegir con un
// clic en vez de escribir la hora a mano. No bloquea nada: es informativo.
async function disponibilidad(req, res, next) {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ mensaje: 'El parametro fecha es requerido (YYYY-MM-DD)' });

    if (!(await verificarDoctorDeLaEmpresa(req.params.id, req.empresaId))) {
      return res.status(404).json({ mensaje: 'Doctor no encontrado' });
    }

    const diaSemanaResult = await pool.query('select extract(dow from $1::date)::int as dia_semana', [fecha]);
    const diaSemana = diaSemanaResult.rows[0].dia_semana;

    const tieneHorarioResult = await pool.query(
      'select exists(select 1 from doctor_horarios where doctor_id = $1 and activo = true) as existe',
      [req.params.id]
    );

    const bloquesResult = await pool.query(
      `select hora_inicio, hora_fin from doctor_horarios
       where doctor_id = $1 and dia_semana = $2 and activo = true
       order by hora_inicio asc`,
      [req.params.id, diaSemana]
    );

    const citasResult = await pool.query(
      `select hora_inicio, hora_fin from citas
       where doctor_id = $1 and fecha = $2 and estado <> 'cancelada'
       order by hora_inicio asc`,
      [req.params.id, fecha]
    );

    const ocupados = citasResult.rows.map((c) => ({ inicio: aMinutos(c.hora_inicio), fin: aMinutos(c.hora_fin) }));

    const libres = [];
    for (const bloque of bloquesResult.rows) {
      const bloqueMinutos = { inicio: aMinutos(bloque.hora_inicio), fin: aMinutos(bloque.hora_fin) };
      const libresBloque = restarOcupados(bloqueMinutos, ocupados);
      for (const { inicio, fin } of libresBloque) {
        for (let t = inicio; t + DURACION_SLOT_MINUTOS <= fin; t += DURACION_SLOT_MINUTOS) {
          libres.push({ hora_inicio: aTexto(t), hora_fin: aTexto(t + DURACION_SLOT_MINUTOS) });
        }
      }
    }

    res.json({
      atiende: bloquesResult.rows.length > 0,
      tiene_horario_configurado: tieneHorarioResult.rows[0].existe,
      dia_semana: diaSemana,
      bloques: bloquesResult.rows.map((b) => ({ hora_inicio: b.hora_inicio.substring(0, 5), hora_fin: b.hora_fin.substring(0, 5) })),
      ocupados: citasResult.rows.map((c) => ({ hora_inicio: c.hora_inicio.substring(0, 5), hora_fin: c.hora_fin.substring(0, 5) })),
      libres,
    });
  } catch (err) { next(err); }
}

module.exports = { listarPorDoctor, crear, actualizar, eliminar, disponibilidad };
