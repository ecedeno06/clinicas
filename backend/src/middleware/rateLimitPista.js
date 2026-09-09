// GET /auth/pista es publico (sin autenticacion): cualquiera que sepa un
// email podria consultarlo repetidas veces para intentar adivinar
// informacion. Limita por IP+email.
const { crearRateLimit } = require('./rateLimit');

module.exports = crearRateLimit({
  limite: 5,
  ventanaMs: 60 * 60 * 1000, // 1 hora
  obtenerClave: (req) => `${req.ip}:${String(req.query.email || '').trim().toLowerCase()}`,
});
