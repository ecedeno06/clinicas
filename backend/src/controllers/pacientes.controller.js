const { pool } = require('../config/db');

// GET /api/pacientes
async function listar(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select p.*, pe.activo
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
      `select p.*, pe.activo
       from pacientes p
       join pacientes_empresas pe on pe.paciente_id = p.id
       where p.id = $1 and pe.empresa_id = $2`,
      [req.params.id, req.empresaId]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Paciente no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
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
      nombre, identificacion, fecha_nacimiento, sexo, telefono, email,
      direccion, contacto_emergencia, alergias, activo,
    } = req.body;

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
        `insert into pacientes (nombre, identificacion, fecha_nacimiento, sexo, telefono, email, direccion, contacto_emergencia, alergias)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
        [
          nombre, identificacion || null, fecha_nacimiento || null, sexo, telefono, email,
          direccion, contacto_emergencia ? JSON.stringify(contacto_emergencia) : null, alergias,
        ]
      );
      paciente = ins.rows[0];
    }

    await client.query(
      `insert into pacientes_empresas (paciente_id, empresa_id, activo) values ($1, $2, coalesce($3, true))`,
      [paciente.id, req.empresaId, activo]
    );

    await client.query('commit');

    const { rows } = await pool.query(
      `select p.*, pe.activo
       from pacientes p join pacientes_empresas pe on pe.paciente_id = p.id and pe.empresa_id = $2
       where p.id = $1`,
      [paciente.id, req.empresaId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('rollback');
    if (err.code === '23505') return res.status(409).json({ mensaje: 'Ya existe un paciente con esa identificacion o correo.' });
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
  try {
    const {
      nombre, identificacion, fecha_nacimiento, sexo, telefono, email,
      direccion, contacto_emergencia, alergias, activo,
    } = req.body;

    const vinculo = await pool.query(
      'select 1 from pacientes_empresas where paciente_id = $1 and empresa_id = $2',
      [req.params.id, req.empresaId]
    );
    if (!vinculo.rows[0]) return res.status(404).json({ mensaje: 'Paciente no encontrado' });

    const { rows } = await pool.query(
      `update pacientes set
         nombre = coalesce($1, nombre),
         identificacion = coalesce($2, identificacion),
         fecha_nacimiento = coalesce($3, fecha_nacimiento),
         sexo = coalesce($4, sexo),
         telefono = coalesce($5, telefono),
         email = coalesce($6, email),
         direccion = coalesce($7, direccion),
         contacto_emergencia = coalesce($8, contacto_emergencia),
         alergias = coalesce($9, alergias)
       where id = $10 returning *`,
      [
        nombre, identificacion, fecha_nacimiento || null, sexo, telefono, email,
        direccion, contacto_emergencia ? JSON.stringify(contacto_emergencia) : null, alergias,
        req.params.id,
      ]
    );

    if (activo !== undefined) {
      await pool.query(
        'update pacientes_empresas set activo = $1 where paciente_id = $2 and empresa_id = $3',
        [activo, req.params.id, req.empresaId]
      );
    }

    const { rows: final } = await pool.query(
      `select p.*, pe.activo
       from pacientes p join pacientes_empresas pe on pe.paciente_id = p.id and pe.empresa_id = $2
       where p.id = $1`,
      [req.params.id, req.empresaId]
    );
    res.json(final[0] || rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ mensaje: 'Ya existe un paciente con esa identificacion o correo.' });
    next(err);
  }
}

// DELETE /api/pacientes/:id
// Desvincula al paciente de ESTA clinica. No borra su identidad global ni
// su historial en otras clinicas donde este vinculado.
async function eliminar(req, res, next) {
  try {
    const { rowCount } = await pool.query(
      'delete from pacientes_empresas where paciente_id = $1 and empresa_id = $2',
      [req.params.id, req.empresaId]
    );
    if (!rowCount) return res.status(404).json({ mensaje: 'Paciente no encontrado' });
    res.status(204).send();
  } catch (err) { next(err); }
}

// GET /api/pacientes/:id/historial  -> historias clinicas del paciente EN ESTA CLINICA
async function historial(req, res, next) {
  try {
    const vinculo = await pool.query(
      'select 1 from pacientes_empresas where paciente_id = $1 and empresa_id = $2',
      [req.params.id, req.empresaId]
    );
    if (!vinculo.rows[0]) return res.status(404).json({ mensaje: 'Paciente no encontrado' });

    const { rows } = await pool.query(
      `select hc.*, c.fecha as fecha_cita, c.hora_inicio as hora_cita, d.nombre as doctor_nombre, e.nombre as especialidad_nombre,
              exists(select 1 from recetas r where r.cita_id = hc.cita_id) as tiene_receta
       from historias_clinicas hc
       join citas c on c.id = hc.cita_id
       join doctores d on d.id = hc.doctor_id
       join especialidades e on e.id = d.especialidad_id
       where hc.paciente_id = $1 and hc.empresa_id = $2
       order by c.fecha desc, c.hora_inicio desc`,
      [req.params.id, req.empresaId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { listar, obtener, crear, actualizar, eliminar, historial, buscarPorIdentificacion };
