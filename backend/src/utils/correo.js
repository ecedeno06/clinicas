const { Resend } = require('resend');

// Envio de correo via Resend (dominio propio mail.vetnetsolutions.com en
// Cloudflare) -- reemplaza el SMTP de Gmail, deshabilitado por Google al
// detectar envio automatizado desde un servidor. Ver
// guia-configuracion-resend.docx para el detalle completo de la migracion.
let resend = null;

function obtenerResend() {
  if (resend) return resend;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY debe estar definida en el entorno para enviar correo');
  }

  resend = new Resend(apiKey);
  return resend;
}

// destinatario: string o array de strings. html es opcional (si no se
// pasa, se usa texto plano para ambos).
async function enviarCorreo({ destinatario, asunto, texto, html }) {
  const remitente = process.env.EMAIL_FROM || 'Clinica <notificaciones@mail.vetnetsolutions.com>';
  const { error } = await obtenerResend().emails.send({
    from: remitente,
    to: destinatario,
    subject: asunto,
    text: texto,
    html: html || texto,
  });
  if (error) {
    throw new Error(`Resend rechazo el envio: ${error.message || JSON.stringify(error)}`);
  }
}

module.exports = { enviarCorreo };
