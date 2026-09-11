// POST /auth/2fa/recovery/notificar-admin es publico: limite mas bajo que
// el de recovery (2/hora), para que no se use para spamear a los super
// admins con avisos falsos.
const { crearRateLimit } = require('./rateLimit');

module.exports = crearRateLimit({
  limite: 2,
  ventanaMs: 60 * 60 * 1000, // 1 hora
  obtenerClave: (req) => `${req.ip}:${String(req.body?.usuarioId || '')}`,
});
