const { pool } = require('../config/db');
const { notificarRespuesta } = require('../utils/notificacionConsentimiento');

// GET /api/consentimiento-datos/:token (publico, sin sesion -- se llega
// por el link del correo). Devuelve el contexto minimo para que la
// pagina publica muestre a quien pertenece la solicitud antes de pedir
// la confirmacion final.
async function obtener(req, res, next) {
  try {
    const { rows } = await pool.query(
      `select ct.respuesta, ct.expira_en, p.nombre as paciente_nombre, e.nombre as empresa_nombre
       from consentimiento_datos_tokens ct
       join pacientes p on p.id = ct.paciente_id
       join empresas e on e.id = ct.empresa_id
       where ct.token = $1`,
      [req.params.token]
    );
    const registro = rows[0];
    if (!registro) return res.status(404).json({ mensaje: 'El enlace es invalido.' });
    if (registro.expira_en <= new Date()) return res.status(410).json({ mensaje: 'El enlace ya expiro. Pide que te envien uno nuevo.' });

    res.json({
      paciente_nombre: registro.paciente_nombre,
      empresa_nombre: registro.empresa_nombre,
      respuesta_actual: registro.respuesta,
      ya_respondido: registro.respuesta !== 'pendiente',
    });
  } catch (err) { next(err); }
}

// POST /api/consentimiento-datos/responder { token, respuesta, otp }
// (publico). "aceptado" exige que el otp coincida con el enviado en el
// correo -- un segundo factor real (solo quien tiene acceso a esa
// bandeja de correo puede completar la aceptacion), "rechazado" no lo
// pide (accion de menor riesgo). La aprobacion queda en la relacion
// paciente-CLINICA (pacientes_empresas de la empresa del token), no en
// el paciente global -- ver migracion 055 y condicionAccesoHistorial en
// pacientes.controller.js.
async function responder(req, res, next) {
  try {
    const { token, respuesta, otp } = req.body || {};
    if (!token) return res.status(400).json({ mensaje: 'token es requerido' });
    if (!['aceptado', 'rechazado'].includes(respuesta)) {
      return res.status(400).json({ mensaje: 'respuesta debe ser "aceptado" o "rechazado"' });
    }

    const { rows } = await pool.query(
      `select ct.id, ct.paciente_id, ct.empresa_id, ct.otp, p.nombre as paciente_nombre, p.identificacion, p.email as paciente_email,
              e.nombre as empresa_nombre, e.email as empresa_email
       from consentimiento_datos_tokens ct
       join pacientes p on p.id = ct.paciente_id
       join empresas e on e.id = ct.empresa_id
       where ct.token = $1 and ct.respuesta = 'pendiente' and ct.expira_en > now()`,
      [token]
    );
    const registro = rows[0];
    if (!registro) return res.status(400).json({ mensaje: 'El enlace es invalido, ya expiro, o ya fue respondido.' });

    if (respuesta === 'aceptado' && String(otp || '').trim() !== registro.otp) {
      return res.status(400).json({ mensaje: 'Codigo incorrecto. Revisa el correo e intenta de nuevo.' });
    }

    await pool.query(
      `update consentimiento_datos_tokens set respuesta = $1, respondido_en = now() where id = $2`,
      [respuesta, registro.id]
    );
    await pool.query(
      `update pacientes_empresas set comparte_historial_clinico = $1 where paciente_id = $2 and empresa_id = $3`,
      [respuesta === 'aceptado', registro.paciente_id, registro.empresa_id]
    );

    await notificarRespuesta({ registro, respuesta });

    res.json({ respuesta, paciente_nombre: registro.paciente_nombre });
  } catch (err) { next(err); }
}

module.exports = { obtener, responder };
