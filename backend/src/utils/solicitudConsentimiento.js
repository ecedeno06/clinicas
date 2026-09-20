const crypto = require('crypto');
const { pool } = require('../config/db');
const { enviarCorreo, escaparHtml } = require('./correo');

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

  const texto = `DECLARACION DE CONSENTIMIENTO PARA COMPARTIR INFORMACION MEDICA ENTRE CLINICAS DEL ECOSISTEMA\n\nYo, ${paciente.nombre}, identificado(a) con cedula/pasaporte N. ${paciente.identificacion || ''}, declaro que he sido informado(a) de manera clara y comprensible, y acepto de forma libre, expresa e informada que mi informacion personal y medica -incluyendo antecedentes clinicos, diagnosticos, tratamientos, resultados de laboratorio y demas informacion relacionada con mi estado de salud- sea compartida entre ${empresa.nombre} y las demas clinicas y centros medicos que forman parte de su ecosistema, con el unico fin de coordinar y dar continuidad a mi atencion medica.\n\nEntiendo que puedo revocar este consentimiento en cualquier momento, sin necesidad de justificar mi decision, comunicandolo a ${contacto}, y que dicha revocacion no afectara el tratamiento realizado con anterioridad.\n\nCodigo de confirmacion (solo si aceptas): ${otp}\n\nPara ACEPTAR: ${enlaceBase}&respuesta=aceptado\nPara RECHAZAR: ${enlaceBase}&respuesta=rechazado`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b;">
      <h2 style="color: #0d9488; margin-bottom: 4px;">${nombreE}</h2>
      <p style="font-size: 13px; color: #64748b; margin-top: 0;">Consentimiento para compartir tu informacion medica</p>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin: 16px 0;">
        <p style="font-weight: 700; margin-top: 0;">DECLARACION DE CONSENTIMIENTO PARA COMPARTIR INFORMACION MEDICA ENTRE CLINICAS DEL ECOSISTEMA</p>
        <p>Yo, <strong>${nombreP}</strong>, identificado(a) con cedula/pasaporte N.&deg; <strong>${identificacionP}</strong>, declaro que he sido informado(a) de manera clara y comprensible, y acepto de forma libre, expresa e informada que mi informacion personal y medica &mdash;incluyendo antecedentes clinicos, diagnosticos, tratamientos, resultados de laboratorio y demas informacion relacionada con mi estado de salud&mdash; sea compartida entre <strong>${nombreE}</strong> y las demas clinicas y centros medicos que forman parte de su ecosistema, con el unico fin de coordinar y dar continuidad a mi atencion medica.</p>
        <p>Entiendo que puedo revocar este consentimiento en cualquier momento, sin necesidad de justificar mi decision, comunicandolo a <strong>${contactoE}</strong>, y que dicha revocacion no afectara el tratamiento realizado con anterioridad.</p>
      </div>

      <p style="text-align:center; font-size: 13px; color:#64748b; margin-bottom: 8px;">Selecciona una opcion:</p>
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
      <p style="font-size: 12px; color:#94a3b8; text-align:center; margin-top:4px;">Rechazar solo pide confirmar. Aceptar te va a pedir el codigo de abajo.</p>

      <div style="background:#f0fdfa; border:1.5px dashed #0d9488; border-radius:10px; padding:14px; text-align:center; margin: 16px 0;">
        <p style="margin:0 0 6px; font-size:12px; color:#0f766e; font-weight:600; text-transform:uppercase; letter-spacing:0.04em;">Codigo de confirmacion (solo para Aceptar)</p>
        <p style="margin:0; font-size:28px; font-weight:800; letter-spacing:0.15em; color:#0d9488;">${otp}</p>
        <p style="margin:6px 0 0; font-size:11px; color:#64748b;">Si haces clic en "Aceptar", la pagina te va a pedir que escribas este codigo para confirmar. Valido por 7 dias.</p>
      </div>
    </div>
  `;

  await enviarCorreo({
    destinatario: paciente.email,
    asunto: `Consentimiento para compartir tu informacion medica - ${empresa.nombre}`,
    texto,
    html,
  });
}

module.exports = { enviarSolicitudConsentimiento };
