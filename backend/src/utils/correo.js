const nodemailer = require('nodemailer');

// Envio de correo via SMTP (hoy: Gmail con contrasena de aplicacion,
// mientras se define un dominio propio -- ver Guia_Gmail_2FA_AppPassword.docx).
// El transporter se crea una sola vez y se reutiliza entre llamadas.
let transporter = null;

function obtenerTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error('SMTP_USER y SMTP_PASS deben estar definidos en el entorno para enviar correo');
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = SSL directo, 587 = STARTTLS
    auth: { user, pass },
  });

  return transporter;
}

// destinatario: string o array de strings. html es opcional (si no se
// pasa, se usa texto plano para ambos).
async function enviarCorreo({ destinatario, asunto, texto, html }) {
  const remitente = process.env.SMTP_FROM || process.env.SMTP_USER;
  await obtenerTransporter().sendMail({
    from: `"Clinica" <${remitente}>`,
    to: destinatario,
    subject: asunto,
    text: texto,
    html: html || texto,
  });
}

module.exports = { enviarCorreo };
