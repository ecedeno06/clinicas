const { pool } = require('../config/db');
const { porcentajeSimilitud } = require('./levenshtein');

// Tabla singleton (una sola fila, id=1) -- ver migracion 050 y
// politicaPassword.controller.js.
async function obtenerPolitica() {
  const { rows } = await pool.query('select * from politica_password where id = 1');
  return rows[0];
}

// Devuelve un arreglo de mensajes de error (vacio si cumple). Se usa en
// cada punto del backend donde un password se define/reemplaza --
// EXCEPTO la password temporal autogenerada al invitar a un paciente
// (ver pacientes.controller.js#invitar), que no se valida porque su
// cambio ya se fuerza en el primer login.
function validarPassword(password, politica) {
  const errores = [];
  if (!password || password.length < politica.longitud_minima) {
    errores.push(`Debe tener al menos ${politica.longitud_minima} caracteres`);
  }
  if (politica.requiere_mayuscula && !/[A-Z]/.test(password || '')) errores.push('Debe incluir al menos una mayuscula');
  if (politica.requiere_minuscula && !/[a-z]/.test(password || '')) errores.push('Debe incluir al menos una minuscula');
  if (politica.requiere_numero && !/[0-9]/.test(password || '')) errores.push('Debe incluir al menos un numero');
  if (politica.requiere_caracter_especial && !/[^A-Za-z0-9]/.test(password || '')) errores.push('Debe incluir al menos un caracter especial');
  return errores;
}

// La pista nunca puede ser igual al password (regla fija, no
// configurable) -- ademas de su propio minimo de longitud y el % de
// similitud maxima, ambos ya parte de la politica.
function validarPista(pista, password, politica) {
  const errores = [];
  if (pista.length < politica.pista_longitud_minima) {
    errores.push(`La pista debe tener al menos ${politica.pista_longitud_minima} caracteres`);
  }
  if (pista.trim().toLowerCase() === String(password || '').trim().toLowerCase()) {
    errores.push('La pista no puede ser igual a la contrasena');
  }
  const similitud = porcentajeSimilitud(password || '', pista);
  if (similitud > politica.pista_similitud_maxima_porcentaje) {
    errores.push(`La pista es demasiado obvia (${similitud.toFixed(0)}% de similitud con la contrasena). Debe parecerse menos de un ${politica.pista_similitud_maxima_porcentaje}%.`);
  }
  return errores;
}

module.exports = { obtenerPolitica, validarPassword, validarPista };
