// Rate-limit simple en memoria para GET /auth/pista (endpoint publico, sin
// autenticacion: cualquiera que sepa un email podria consultarlo repetidas
// veces para intentar adivinar informacion). Limita por IP+email, no
// requiere Redis ni tabla nueva -- suficiente para el volumen de esta app.
const LIMITE_INTENTOS = 5;
const VENTANA_MS = 60 * 60 * 1000; // 1 hora

const intentos = new Map();

function limpiarVencidos(ahora) {
  for (const [clave, registro] of intentos) {
    if (registro.resetAt < ahora) intentos.delete(clave);
  }
}

function rateLimitPista(req, res, next) {
  const email = String(req.query.email || '').trim().toLowerCase();
  const clave = `${req.ip}:${email}`;
  const ahora = Date.now();

  if (intentos.size > 1000) limpiarVencidos(ahora);

  const registro = intentos.get(clave);
  if (!registro || registro.resetAt < ahora) {
    intentos.set(clave, { count: 1, resetAt: ahora + VENTANA_MS });
    return next();
  }
  if (registro.count >= LIMITE_INTENTOS) {
    return res.status(429).json({ mensaje: 'Demasiados intentos. Intenta de nuevo mas tarde.' });
  }
  registro.count += 1;
  next();
}

module.exports = rateLimitPista;
