const { pool } = require('../config/db');

const EMAIL_SUPER_ADMIN_INICIAL_DEFAULT = 'admin@clinica';

// Al arrancar el backend, si no existe ningun usuario con el email de
// SUPER_ADMIN_USER (env, o admin@clinica si no se define), lo crea como
// super administrador usando el hash de SUPER_ADMIN_PASS (env).
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

  const email = process.env.SUPER_ADMIN_USER || EMAIL_SUPER_ADMIN_INICIAL_DEFAULT;

  const { rows } = await pool.query('select id from usuarios where email = $1', [email]);
  if (rows[0]) return;

  await pool.query(
    `insert into usuarios (nombre, email, password_hash, activo, es_super_admin)
     values ($1, $2, $3, true, true)`,
    ['Super Administrador', email, passwordHash]
  );
  console.log(`Super administrador inicial creado: ${email}`);
}

module.exports = { asegurarSuperAdminInicial, EMAIL_SUPER_ADMIN_INICIAL_DEFAULT };
