const crypto = require('crypto');

// Cifra/descifra usuarios.two_factor_secret (AES-256-CBC) para no guardar
// el secreto TOTP en texto plano. La clave sale de CRYPTO_SECRET_KEY
// (32 caracteres, o 64 caracteres hexadecimales = 32 bytes).
const ALGORITMO = 'aes-256-cbc';
const LONGITUD_IV = 16;

function obtenerClave() {
  const clave = process.env.CRYPTO_SECRET_KEY;
  if (!clave) throw new Error('CRYPTO_SECRET_KEY no esta definida en el entorno');
  if (clave.length === 64) {
    const bufferHex = Buffer.from(clave, 'hex');
    if (bufferHex.length === 32) return bufferHex;
  }
  const buffer = Buffer.from(clave);
  if (buffer.length === 32) return buffer;
  throw new Error('CRYPTO_SECRET_KEY debe tener exactamente 32 caracteres, o 64 caracteres hexadecimales');
}

function encriptar(texto) {
  const iv = crypto.randomBytes(LONGITUD_IV);
  const cipher = crypto.createCipheriv(ALGORITMO, obtenerClave(), iv);
  const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cifrado.toString('hex')}`;
}

function desencriptar(textoCifrado) {
  const [ivHex, cifradoHex] = textoCifrado.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITMO, obtenerClave(), iv);
  const descifrado = Buffer.concat([decipher.update(Buffer.from(cifradoHex, 'hex')), decipher.final()]);
  return descifrado.toString('utf8');
}

module.exports = { encriptar, desencriptar };
