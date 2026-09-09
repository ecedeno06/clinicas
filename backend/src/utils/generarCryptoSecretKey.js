// Genera una clave valida para CRYPTO_SECRET_KEY (ver cifrado2fa.js):
// 32 bytes aleatorios codificados en hexadecimal (64 caracteres), el
// formato que exige AES-256-CBC.
//
// Uso desde la linea de comandos:
//   node src/utils/generarCryptoSecretKey.js
const crypto = require('crypto');

function generarCryptoSecretKey() {
  return crypto.randomBytes(32).toString('hex');
}

if (require.main === module) {
  console.log(generarCryptoSecretKey());
}

module.exports = { generarCryptoSecretKey };
