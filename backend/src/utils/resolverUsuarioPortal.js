const bcrypt = require('bcryptjs');
const { generarPasswordTemporal } = require('./passwordTemporal');
const { obtenerPolitica } = require('./politicaPassword');

// Usado por pacientes.controller.js#invitar y doctores.controller.js#invitar
// (misma logica, duplicada antes en ambos) al invitar a alguien que TODAVIA
// no tiene usuario_id: crea una cuenta nueva si el correo no existe, o
// reutiliza la existente si ya hay una cuenta con ese correo (ej. la misma
// persona ya es doctor/admin en otra clinica).
//
// Reutilizar NUNCA es silencioso: si el correo coincide con una cuenta que
// ya existe, se exige confirmarVincularExistente=true (el frontend primero
// recibe el nombre de esa cuenta via el error que se lanza aca, se lo
// muestra al admin, y solo si confirma que es la misma persona reintenta
// con la bandera en true). Sin esto, un correo mal escrito que coincide por
// accidente con la cuenta de un tercero le daba acceso a datos ajenos sin
// que nadie lo notara.
//
// tablaVinculo/etiquetaVinculo: la cuenta encontrada puede ya estar vinculada
// a OTRO paciente/doctor distinto (usuario_id es 1:1 con esa tabla, ver
// uq_pacientes_usuario) -- eso no es "reutilizable" bajo ningun escenario
// (confirmarlo igual reventaria contra esa restriccion), asi que se bloquea
// aparte, sin ofrecer la opcion de confirmar.
async function resolverUsuarioPortal({ client, nombre, email, confirmarVincularExistente, tablaVinculo, etiquetaVinculo }) {
  // tablaVinculo se interpola directo en la consulta -- nunca vale nada que
  // no sea uno de estos dos nombres fijos que pasan pacientes.controller.js
  // y doctores.controller.js, jamas algo derivado de un input externo.
  if (tablaVinculo !== 'pacientes' && tablaVinculo !== 'doctores') {
    throw new Error(`tablaVinculo invalido: ${tablaVinculo}`);
  }
  const existente = await client.query('select id, nombre from usuarios where email = $1', [email]);
  if (existente.rows[0]) {
    const otroVinculo = await client.query(
      `select nombre from ${tablaVinculo} where usuario_id = $1 limit 1`,
      [existente.rows[0].id]
    );
    if (otroVinculo.rows[0]) {
      const err = new Error('Esa cuenta ya esta vinculada a otro registro.');
      err.yaVinculadoAOtro = true;
      err.otroNombre = otroVinculo.rows[0].nombre;
      err.etiquetaVinculo = etiquetaVinculo;
      throw err;
    }
    if (!confirmarVincularExistente) {
      const err = new Error('Ya existe una cuenta con ese correo.');
      err.requiereConfirmacion = true;
      err.cuentaExistente = existente.rows[0];
      throw err;
    }
    return { usuarioId: existente.rows[0].id, nuevaCuenta: false, passwordTemporal: null };
  }

  // No se valida contra la politica de password (es aleatoria y se fuerza
  // su cambio en el primer login), pero respeta el minimo configurado en
  // vez de un largo fijo.
  const politica = await obtenerPolitica();
  const passwordTemporal = generarPasswordTemporal(Math.max(10, politica.longitud_minima));
  const passwordHash = await bcrypt.hash(passwordTemporal, 10);
  const nuevo = await client.query(
    `insert into usuarios (nombre, email, password_hash, activo, debe_cambiar_password)
     values ($1, $2, $3, true, true) returning id`,
    [nombre, email, passwordHash]
  );
  return { usuarioId: nuevo.rows[0].id, nuevaCuenta: true, passwordTemporal };
}

// Cambia el correo de LOGIN (usuarios.email) de una cuenta ya existente --
// distinto del correo de contacto (pacientes.email/doctores.email), que ya
// se edita desde el formulario normal. Pensado para el caso donde alguien
// perdio acceso a la bandeja de su correo de login (o quedo mal escrito al
// invitarlo, ver resolverUsuarioPortal de arriba): un admin lo corrige aca
// en vez de tener que desvincular la cuenta entera y reinvitar de cero.
// No fusiona cuentas -- si el correo nuevo ya pertenece a OTRA cuenta, se
// rechaza sin ofrecer ninguna confirmacion (eso seria fusionar identidades,
// una operacion mucho mas delicada, fuera de alcance de este cambio).
async function cambiarEmailAcceso({ pool, usuarioId, nuevoEmail }) {
  const ocupado = await pool.query('select id from usuarios where email = $1 and id <> $2', [nuevoEmail, usuarioId]);
  if (ocupado.rows[0]) {
    const err = new Error('Ese correo ya pertenece a otra cuenta.');
    err.correoOcupado = true;
    throw err;
  }
  await pool.query('update usuarios set email = $1 where id = $2', [nuevoEmail, usuarioId]);
}

module.exports = { resolverUsuarioPortal, cambiarEmailAcceso };
