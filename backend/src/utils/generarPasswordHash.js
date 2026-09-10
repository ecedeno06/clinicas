// Genera el hash de una contrasena exactamente como lo hace el backend
// (bcryptjs, 10 rondas de salt -- mismo costo usado en auth.controller.js
// y usuarios.controller.js). Sirve para actualizar/crear un password_hash
// directo en la base de datos sin pasar por la API.
//
// Uso desde la linea de comandos:
//   node src/utils/generarPasswordHash.js "MiContrasena123"
const bcrypt = require('bcryptjs');

const RONDAS_SALT = 10;

function generarPasswordHash(password) {
  return bcrypt.hashSync(password, RONDAS_SALT);
}

if (require.main === module) {
  const password = process.argv[2];
  if (!password) {
    console.error('Uso: node src/utils/generarPasswordHash.js "MiContrasena123"');
    process.exit(1);
  }
  console.log(generarPasswordHash(password));
}

module.exports = { generarPasswordHash };
