// Rate-limit simple en memoria, reusable para endpoints publicos (sin
// autenticacion) que no deben poder golpearse en bucle -- ni Redis ni
// tabla nueva, suficiente para el volumen de esta app.
function crearRateLimit({ limite, ventanaMs, obtenerClave }) {
  const intentos = new Map();

  function limpiarVencidos(ahora) {
    for (const [clave, registro] of intentos) {
      if (registro.resetAt < ahora) intentos.delete(clave);
    }
  }

  return function rateLimit(req, res, next) {
    const clave = obtenerClave(req);
    const ahora = Date.now();

    if (intentos.size > 1000) limpiarVencidos(ahora);

    const registro = intentos.get(clave);
    if (!registro || registro.resetAt < ahora) {
      intentos.set(clave, { count: 1, resetAt: ahora + ventanaMs });
      return next();
    }
    if (registro.count >= limite) {
      return res.status(429).json({ mensaje: 'Demasiados intentos. Intenta de nuevo mas tarde.' });
    }
    registro.count += 1;
    next();
  };
}

module.exports = { crearRateLimit };
