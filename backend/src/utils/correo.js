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
// pasa, se usa texto plano para ambos). cc es opcional (string o array),
// para cuando el mismo correo debe llegarle tambien a alguien mas sin
// que sea el destinatario principal (ej. notificaciones de
// consentimiento-datos, donde el paciente va en copia).
async function enviarCorreo({ destinatario, asunto, texto, html, cc }) {
  const remitente = process.env.EMAIL_FROM || 'Clinica <notificaciones@mail.vetnetsolutions.com>';
  const { error } = await obtenerResend().emails.send({
    from: remitente,
    to: destinatario,
    ...(cc ? { cc } : {}),
    subject: asunto,
    text: texto,
    html: html || texto,
  });
  if (error) {
    throw new Error(`Resend rechazo el envio: ${error.message || JSON.stringify(error)}`);
  }
}

// Escapa texto que se va a insertar crudo en el HTML de un correo -- sin
// esto, un caracter especial de una contrasena generada (GEN_ESPECIALES
// incluye "&", ver politicaPassword.js) o del nombre de una clinica (ej.
// "M&M Pediatrics") se puede interpretar como el inicio de una entidad
// HTML en el cliente de correo, dejando el texto incompleto o distinto
// del literal que se guardo -- justo lo que rompia el reseteo de
// contrasena (ver resetearPassword en pacientes/doctores/usuarios
// .controller.js).
function escaparHtml(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { enviarCorreo, escaparHtml };
