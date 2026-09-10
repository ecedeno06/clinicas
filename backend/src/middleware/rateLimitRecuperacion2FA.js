// POST /auth/2fa/recovery es publico (solo requiere el usuarioId que ya
// devolvio el login tras validar la contrasena, no autenticacion completa):
// limita por IP+usuario para no permitir saturar de correos a una cuenta.
const { crearRateLimit } = require('./rateLimit');

module.exports = crearRateLimit({
  limite: 3,
  ventanaMs: 60 * 60 * 1000, // 1 hora
  obtenerClave: (req) => `${req.ip}:${String(req.body?.usuarioId || '')}`,
});
