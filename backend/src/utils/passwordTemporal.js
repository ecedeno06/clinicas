const crypto = require('crypto');

// Sin caracteres ambiguos (0/O, 1/l/I) para que sea facil de transcribir
// desde un correo. Se usa para la password inicial de una cuenta invitada
// (paciente), que de todas formas debe cambiarse en el primer login.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function generarPasswordTemporal(longitud = 10) {
  const bytes = crypto.randomBytes(longitud);
  let pass = '';
  for (let i = 0; i < longitud; i++) pass += ALFABETO[bytes[i] % ALFABETO.length];
  return pass;
}

module.exports = { generarPasswordTemporal };
