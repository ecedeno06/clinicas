const crypto = require('crypto');
const { pool } = require('../config/db');
const { enviarCorreo, escaparHtml } = require('./correo');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Genera el token+OTP, los guarda en consentimiento_datos_tokens y envia
// el correo con el disclaimer + boton de aceptar/rechazar (aceptar
// ademas pide el OTP en la pagina publica) -- reutilizado por el flujo
// de staff (pacientes.controller.js#solicitarConsentimientoDatos) y el
// de autoservicio del paciente desde su propio portal
// (portalPaciente.controller.js#solicitarConsentimiento). Ambos arman
// `paciente`/`empresa` con sus propias consultas antes de llamar esto.
async function enviarSolicitudConsentimiento({ pacienteId, empresaId, paciente, empresa }) {
  const token = 'cds_' + crypto.randomBytes(32).toString('hex');
  const otp = crypto.randomInt(100000, 1000000).toString();
  const expiraEn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await pool.query(
    `insert into consentimiento_datos_tokens (paciente_id, empresa_id, token, otp, expira_en)
     values ($1, $2, $3, $4, $5)`,
    [pacienteId, empresaId, token, otp, expiraEn]
  );

  const contacto = [empresa.email, empresa.telefono].filter(Boolean).join(' / ') || 'la clinica';
  const enlaceBase = `${process.env.CORS_ORIGIN || 'http://localhost:4201'}/consentimiento-datos?token=${token}`;

  const nombreP = escaparHtml(paciente.nombre);
  const identificacionP = escaparHtml(paciente.identificacion || 'sin identificacion registrada');
  const nombreE = escaparHtml(empresa.nombre);
  const contactoE = escaparHtml(contacto);

  const texto = `DECLARACIÓN DE CONSENTIMIENTO PARA COMPARTIR INFORMACIÓN MÉDICA ENTRE CLÍNICAS DEL ECOSISTEMA\n\nYo, ${paciente.nombre}, identificado(a) con cédula/pasaporte N.° ${paciente.identificacion || ''}, declaro que he sido informado(a) de manera clara y comprensible, y acepto de forma libre, expresa e informada que mi información personal y médica -incluyendo antecedentes clínicos, diagnósticos, tratamientos, resultados de laboratorio y demás información relacionada con mi estado de salud- sea compartida entre ${empresa.nombre} y las demás clínicas y centros médicos que forman parte de su ecosistema, con el único fin de coordinar y dar continuidad a mi atención médica.\n\nEntiendo que este consentimiento tiene efecto en dos sentidos: permite que ${empresa.nombre} comparta mi información con las demás clínicas de la red, y permite también que ${empresa.nombre} reciba y consulte la información que otra clínica de la red haya compartido sobre mí -en ambos casos, únicamente respecto de aquellas clínicas donde yo también haya otorgado este mismo consentimiento.\n\nEntiendo que puedo revocar este consentimiento en cualquier momento, sin necesidad de justificar mi decisión, comunicándolo a ${contacto}, y que dicha revocación no afectará el tratamiento realizado con anterioridad.\n\nEntiendo que la clínica ${empresa.nombre} puede rechazar el uso de información compartida generada en esta clínica por su propia cuenta, con el objetivo de evitar el mal uso de la información del paciente, en cualquier momento y sin previo aviso.\n\nCódigo de confirmación (solo si aceptas): ${otp}\n\nPara ACEPTAR: ${enlaceBase}&respuesta=aceptado\nPara RECHAZAR: ${enlaceBase}&respuesta=rechazado`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b;">
      <h2 style="color: #0d9488; margin-bottom: 4px;">${nombreE}</h2>
      <p style="font-size: 13px; color: #64748b; margin-top: 0;">Consentimiento para compartir tu información médica</p>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin: 16px 0;">
        <p style="font-weight: 700; margin-top: 0;">DECLARACIÓN DE CONSENTIMIENTO PARA COMPARTIR INFORMACIÓN MÉDICA ENTRE CLÍNICAS DEL ECOSISTEMA</p>
        <p>Yo, <strong>${nombreP}</strong>, identificado(a) con cédula/pasaporte N.&deg; <strong>${identificacionP}</strong>, declaro que he sido informado(a) de manera clara y comprensible, y acepto de forma libre, expresa e informada que mi información personal y médica &mdash;incluyendo antecedentes clínicos, diagnósticos, tratamientos, resultados de laboratorio y demás información relacionada con mi estado de salud&mdash; sea compartida entre <strong>${nombreE}</strong> y las demás clínicas y centros médicos que forman parte de su ecosistema, con el único fin de coordinar y dar continuidad a mi atención médica.</p>
        <p>Entiendo que este consentimiento tiene efecto en dos sentidos: permite que <strong>${nombreE}</strong> comparta mi información con las demás clínicas de la red, y permite también que <strong>${nombreE}</strong> reciba y consulte la información que otra clínica de la red haya compartido sobre mí &mdash;en ambos casos, únicamente respecto de aquellas clínicas donde yo también haya otorgado este mismo consentimiento.</p>
        <p>Entiendo que puedo revocar este consentimiento en cualquier momento, sin necesidad de justificar mi decisión, comunicándolo a <strong>${contactoE}</strong>, y que dicha revocación no afectará el tratamiento realizado con anterioridad.</p>
        <p>Entiendo que la clínica <strong>${nombreE}</strong> puede rechazar el uso de información compartida generada en esta clínica por su propia cuenta, con el objetivo de evitar el mal uso de la información del paciente, en cualquier momento y sin previo aviso.</p>
      </div>

      <p style="text-align:center; font-size: 13px; color:#64748b; margin-bottom: 8px;">Selecciona una opción:</p>
      <table role="presentation" style="width:100%; margin: 0 auto 4px;">
        <tr>
          <td style="text-align:center; padding: 0 8px;">
            <a href="${enlaceBase}&respuesta=aceptado" style="display:inline-block; background:#0d9488; color:#ffffff; text-decoration:none; font-weight:700; padding:12px 28px; border-radius:8px; font-size:14px;">Aceptar</a>
          </td>
          <td style="text-align:center; padding: 0 8px;">
            <a href="${enlaceBase}&respuesta=rechazado" style="display:inline-block; background:#ffffff; color:#dc2626; text-decoration:none; font-weight:700; padding:12px 28px; border-radius:8px; font-size:14px; border:1.5px solid #dc2626;">Rechazar</a>
          </td>
        </tr>
      </table>
      <p style="font-size: 12px; color:#94a3b8; text-align:center; margin-top:4px;">Rechazar solo pide confirmar. Aceptar te va a pedir el código de abajo.</p>

      <div style="background:#f0fdfa; border:1.5px dashed #0d9488; border-radius:10px; padding:14px; text-align:center; margin: 16px 0;">
        <p style="margin:0 0 6px; font-size:12px; color:#0f766e; font-weight:600; text-transform:uppercase; letter-spacing:0.04em;">Código de confirmación (solo para Aceptar)</p>
        <p style="margin:0; font-size:28px; font-weight:800; letter-spacing:0.15em; color:#0d9488;">${otp}</p>
        <p style="margin:6px 0 0; font-size:11px; color:#64748b;">Si haces clic en "Aceptar", la página te va a pedir que escribas este código para confirmar. Válido por 7 días.</p>
      </div>
    </div>
  `;

  await enviarCorreo({
    destinatario: paciente.email,
    asunto: `Consentimiento para compartir tu información médica - ${empresa.nombre}`,
    texto,
    html,
  });
}

// A diferencia de enviarSolicitudConsentimiento (que ofrece Aceptar o
// Rechazar una solicitud NUEVA), esto es para cuando el paciente, ya
// autenticado en su portal, pide DEJAR de compartir algo que ya estaba
// activo -- ver portalPaciente.controller.js#solicitarRevocacion. Solo
// hay un camino (confirmar el rechazo con el OTP), asi que el correo no
// ofrece opciones -- y a diferencia de la solicitud original, este SI
// lleva copia (CC) a los super-admin y a la clinica, para que quede
// registrado que el paciente inicio el tramite (independiente de si
// despues completa el OTP o no).
async function enviarSolicitudRevocacion({ pacienteId, empresaId, paciente, empresa }) {
  const token = 'cds_' + crypto.randomBytes(32).toString('hex');
  const otp = crypto.randomInt(100000, 1000000).toString();
  const expiraEn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await pool.query(
    `insert into consentimiento_datos_tokens (paciente_id, empresa_id, token, otp, expira_en, accion)
     values ($1, $2, $3, $4, $5, 'revocacion')`,
    [pacienteId, empresaId, token, otp, expiraEn]
  );

  const enlace = `${process.env.CORS_ORIGIN || 'http://localhost:4201'}/consentimiento-datos?token=${token}&respuesta=rechazado`;
  const nombreE = escaparHtml(empresa.nombre);
  const identificacionP = escaparHtml(paciente.identificacion || 'sin identificacion registrada');

  const superAdmins = await pool.query(
    `select email from usuarios where es_super_admin = true and acepta_correo_super_admin = true and email is not null`
  );
  const cc = [...superAdmins.rows.map((r) => r.email), empresa.email].filter((email) => email && EMAIL_REGEX.test(email));

  const texto = `Solicitaste dejar de compartir tu información médica de ${empresa.nombre} con las demás clínicas del ecosistema.\n\nNo. de identidad: ${paciente.identificacion || 'N/D'}\n\nCódigo de confirmación: ${otp}\n\nPara confirmar: ${enlace}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b;">
      <h2 style="color: #dc2626; margin-bottom: 4px;">${nombreE}</h2>
      <p style="font-size: 13px; color: #64748b; margin-top: 0;">Confirmar que dejas de compartir tu información médica</p>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin: 16px 0;">
        <p>Solicitaste dejar de compartir tu información médica de <strong>${nombreE}</strong> con las demás clínicas y centros médicos del ecosistema.</p>
        <p style="color:#64748b; font-size:13px;">No. de identidad: <strong>${identificacionP}</strong></p>
        <p>Para confirmarlo, escribe el código de abajo en la página de confirmación. Si no fuiste tú quien pidió esto, ignora este correo -- tu información sigue compartiéndose normalmente.</p>
      </div>

      <div style="background:#fef2f2; border:1.5px dashed #dc2626; border-radius:10px; padding:14px; text-align:center; margin: 16px 0;">
        <p style="margin:0 0 6px; font-size:12px; color:#991b1b; font-weight:600; text-transform:uppercase; letter-spacing:0.04em;">Código de confirmación</p>
        <p style="margin:0; font-size:28px; font-weight:800; letter-spacing:0.15em; color:#dc2626;">${otp}</p>
        <p style="margin:6px 0 0; font-size:11px; color:#64748b;">Válido por 7 días.</p>
      </div>

      <table role="presentation" style="width:100%; margin: 0 auto 4px;">
        <tr><td style="text-align:center;">
          <a href="${enlace}" style="display:inline-block; background:#dc2626; color:#ffffff; text-decoration:none; font-weight:700; padding:12px 28px; border-radius:8px; font-size:14px;">Continuar</a>
        </td></tr>
      </table>
    </div>
  `;

  await enviarCorreo({
    destinatario: paciente.email,
    cc: cc.length ? cc : undefined,
    asunto: `Confirmar que dejas de compartir tu información - ${empresa.nombre}`,
    texto,
    html,
  });
}

module.exports = { enviarSolicitudConsentimiento, enviarSolicitudRevocacion };
