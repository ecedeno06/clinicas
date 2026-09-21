const { pool } = require('../config/db');
const { enviarCorreo, escaparHtml } = require('./correo');
const { ZONA_HORARIA_DEFAULT } = require('./zonaHoraria');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Avisa a super-admin y a la clinica que pidio/tenia el consentimiento,
// con copia (CC) al paciente, sea que la respuesta llegue por el link
// publico de correo (consentimientoDatos.controller.js#responder) o que
// el paciente la revoque el mismo desde su portal ya autenticado
// (portalPaciente.controller.js#revocarConsentimiento) -- mismo correo
// en ambos casos, no hay forma de distinguir el origen ni falta que se
// distinga.
//
// No es tecnicamente posible enviarlo "desde" el correo del paciente --
// Gmail y el resto bloquean/marcan como spam cualquier remitente que no
// paso por su propia infraestructura (SPF/DKIM/DMARC), y Resend exige
// que el remitente sea del dominio verificado. El CC logra el mismo
// efecto practico: el paciente recibe la confirmacion en su propia
// bandeja, en el mismo correo. Si este envio falla, solo se loguea --
// nunca revierte la respuesta ya guardada.
//
// registro: { paciente_id, empresa_id, paciente_nombre, identificacion, paciente_email, empresa_nombre, empresa_email }
// respuesta: 'aceptado' | 'rechazado'
async function notificarRespuesta({ registro, respuesta }) {
  try {
    const superAdmins = await pool.query(
      `select email from usuarios where es_super_admin = true and acepta_correo_super_admin = true and email is not null`
    );
    // Resend rechaza el envio COMPLETO si un solo correo del array "to" no
    // tiene formato valido -- una sola cuenta con el correo mal escrito no
    // deberia tumbar la notificacion para todos los demas destinatarios.
    const destinatarios = [...superAdmins.rows.map((r) => r.email), registro.empresa_email]
      .filter((email) => email && EMAIL_REGEX.test(email));
    if (!destinatarios.length) return;

    const aceptado = respuesta === 'aceptado';
    const asunto = `Consentimiento ${aceptado ? 'aceptado' : 'rechazado'} - ${registro.paciente_nombre} (${registro.empresa_nombre})`;
    const nombreP = escaparHtml(registro.paciente_nombre);
    const identificacionP = escaparHtml(registro.identificacion || 'sin identificacion registrada');
    const nombreE = escaparHtml(registro.empresa_nombre);

    // La hora del servidor (produccion corre en UTC) no es la de la
    // clinica -- se usa la zona horaria de alguna de sus sucursales
    // (mismo criterio que zonaHoraria.js), igual que ya se hace para
    // horarios/disponibilidad de doctores.
    const sucursal = await pool.query(
      `select zona_horaria from sucursales where empresa_id = $1 and activo = true order by created_at asc limit 1`,
      [registro.empresa_id]
    );
    const zonaHoraria = sucursal.rows[0]?.zona_horaria || ZONA_HORARIA_DEFAULT;
    const fecha = new Date().toLocaleString('es-PA', { timeZone: zonaHoraria });

    const texto = `El paciente ${registro.paciente_nombre} (identificación ${registro.identificacion || 'N/D'}) ${aceptado ? 'ACEPTÓ' : 'RECHAZÓ'} el consentimiento para compartir su información médica entre las clínicas del ecosistema, solicitado por ${registro.empresa_nombre}.\n\nFecha: ${fecha}\nCorreo del paciente: ${registro.paciente_email || 'N/D'}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; color:#1e293b;">
        <p>El paciente <strong>${nombreP}</strong> (identificación <strong>${identificacionP}</strong>)
        ${aceptado
          ? '<strong style="color:#0d9488;">ACEPTÓ</strong>'
          : '<strong style="color:#dc2626;">RECHAZÓ</strong>'}
        el consentimiento para compartir su información médica entre las clínicas del ecosistema, solicitado por <strong>${nombreE}</strong>.</p>
        <p style="color:#64748b; font-size:13px;">Fecha: ${escaparHtml(fecha)}<br>Correo del paciente: ${escaparHtml(registro.paciente_email || 'N/D')}</p>
      </div>
    `;

    await enviarCorreo({
      destinatario: destinatarios,
      cc: (registro.paciente_email && EMAIL_REGEX.test(registro.paciente_email)) ? registro.paciente_email : undefined,
      asunto,
      texto,
      html,
    });
  } catch (err) {
    console.error('No se pudo enviar la notificacion de consentimiento-datos', err);
  }
}

// Carta dirigida directamente al PACIENTE (no al super-admin/clinica
// como destinatario principal, aunque van en copia) cuando es el STAFF
// de la clinica quien revoca el compartir directamente -- ver
// pacientes.controller.js#rechazarConsentimientoDatos. A diferencia de
// notificarRespuesta (que solo avisa "el paciente decidio X"), aca es la
// CLINICA quien decidio, asi que el paciente necesita una explicacion
// accionable (que no afecta su atencion, y como reobtener la
// informacion si la necesita), no solo un aviso.
//
// registro: { paciente_id, empresa_id, paciente_nombre, identificacion, paciente_email, empresa_nombre, empresa_email, empresa_telefono }
async function notificarRevocacionStaff({ registro }) {
  try {
    if (!registro.paciente_email || !EMAIL_REGEX.test(registro.paciente_email)) return;

    const superAdmins = await pool.query(
      `select email from usuarios where es_super_admin = true and acepta_correo_super_admin = true and email is not null`
    );
    const cc = [...superAdmins.rows.map((r) => r.email), registro.empresa_email].filter((email) => email && EMAIL_REGEX.test(email));

    const nombreP = escaparHtml(registro.paciente_nombre);
    const identificacionP = escaparHtml(registro.identificacion || 'sin identificacion registrada');
    const nombreE = escaparHtml(registro.empresa_nombre);
    const contacto = registro.empresa_telefono || registro.empresa_email || 'la clinica';
    const contactoE = escaparHtml(contacto);

    const asunto = `Se dejó de compartir tu información de ${registro.empresa_nombre}`;

    const texto = `Estimado(a) ${registro.paciente_nombre},\nNo. De Identidad: ${registro.identificacion || 'N/D'}\n\nLe escribimos de parte de ${registro.empresa_nombre} en relación con la solicitud de uso de su información médica compartida, generada previamente en ${registro.empresa_nombre}.\n\nLe notificamos que ha sido revocado el compartir los datos generados en esta clínica con el resto de la red por motivos de seguridad.\n\nEsto no afecta la atención que usted recibirá en nuestra clínica. Sin embargo, es posible que sea necesario:\n- Volver a solicitar el envío de la información directamente desde ${registro.empresa_nombre}, o\n\nSi tiene alguna pregunta sobre este proceso o desea que le ayudemos a coordinar el reenvío de su información, no dude en contactarnos al ${contacto} o responder a este correo.\n\nAgradecemos su comprensión y quedamos atentos para ayudarle con cualquier trámite adicional.\n\nSaludos cordiales,\n${registro.empresa_nombre}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b;">
        <p>Estimado(a) <strong>${nombreP}</strong>,<br>No. De Identidad: ${identificacionP}</p>
        <p>Le escribimos de parte de <strong>${nombreE}</strong> en relación con la solicitud de uso de su información médica compartida, generada previamente en <strong>${nombreE}</strong>.</p>
        <p>Le notificamos que ha sido revocado el compartir los datos generados en esta clínica con el resto de la red por motivos de seguridad.</p>
        <p>Esto no afecta la atención que usted recibirá en nuestra clínica. Sin embargo, es posible que sea necesario:</p>
        <ul style="margin: 0 0 16px;">
          <li>Volver a solicitar el envío de la información directamente desde <strong>${nombreE}</strong>, o</li>
        </ul>
        <p>Si tiene alguna pregunta sobre este proceso o desea que le ayudemos a coordinar el reenvío de su información, no dude en contactarnos al <strong>${contactoE}</strong> o responder a este correo.</p>
        <p>Agradecemos su comprensión y quedamos atentos para ayudarle con cualquier trámite adicional.</p>
        <p>Saludos cordiales,<br><strong>${nombreE}</strong></p>
      </div>
    `;

    await enviarCorreo({
      destinatario: registro.paciente_email,
      cc: cc.length ? cc : undefined,
      asunto,
      texto,
      html,
    });
  } catch (err) {
    console.error('No se pudo enviar la carta de revocacion (staff) de consentimiento-datos', err);
  }
}

module.exports = { notificarRespuesta, notificarRevocacionStaff };
