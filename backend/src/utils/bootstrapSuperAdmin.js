const { pool } = require('../config/db');

const EMAIL_SUPER_ADMIN_INICIAL = 'admin@clinica';

// Al arrancar el backend, si no existe ningun usuario con este email, lo
// crea como super administrador usando el hash de SUPER_ADMIN_PASS (env).
// SUPER_ADMIN_PASS debe ser ya un hash bcrypt (generar uno con
// "node src/utils/generarPasswordHash.js 'MiContrasena'"), no la
// contrasena en texto plano -- asi la contrasena real nunca queda escrita
// en el .env, ni siquiera de forma temporal. Pensado para el primer
// arranque de una instalacion nueva, sin tener que crear el primer super
// admin a mano en la base de datos.
//
// Si el usuario YA existe, no se toca nada -- en particular, no le
// resetea la contrasena en cada reinicio del servidor (si el operador
// cambia SUPER_ADMIN_PASS en el .env despues de la primera vez, no tiene
// ningun efecto).
async function asegurarSuperAdminInicial() {
  const passwordHash = process.env.SUPER_ADMIN_PASS;
  if (!passwordHash) return;

  const { rows } = await pool.query('select id from usuarios where email = $1', [EMAIL_SUPER_ADMIN_INICIAL]);
  if (rows[0]) return;

  await pool.query(
    `insert into usuarios (nombre, email, password_hash, activo, es_super_admin)
     values ($1, $2, $3, true, true)`,
    ['Super Administrador', EMAIL_SUPER_ADMIN_INICIAL, passwordHash]
  );
  console.log(`Super administrador inicial creado: ${EMAIL_SUPER_ADMIN_INICIAL}`);
}

module.exports = { asegurarSuperAdminInicial, EMAIL_SUPER_ADMIN_INICIAL };
