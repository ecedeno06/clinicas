// POST /auth/forgot-password es publico (sin autenticacion): sin limite,
// alguien podria usarlo para saturar de correos a un usuario, o para
// tantear que emails existen por diferencias de tiempo de respuesta.
// Limita por IP+email, mas estricto que el de "pista" porque cada intento
// exitoso manda un correo real.
const { crearRateLimit } = require('./rateLimit');

module.exports = crearRateLimit({
  limite: 3,
  ventanaMs: 60 * 60 * 1000, // 1 hora
  obtenerClave: (req) => `${req.ip}:${String(req.body?.email || '').trim().toLowerCase()}`,
});
