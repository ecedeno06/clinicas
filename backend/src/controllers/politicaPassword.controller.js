const { pool } = require('../config/db');
const { obtenerPolitica } = require('../utils/politicaPassword');

// GET /api/politica-password -- publico (sin requireAuth): el login, la
// pagina de "restablecer contrasena" (publica, llega por un enlace en un
// correo) y el formulario de cambio de contrasena necesitan mostrar/
// validar los requisitos antes o independientemente de estar
// autenticados. No expone nada sensible, solo la configuracion de forma.
async function obtener(req, res, next) {
  try {
    res.json(await obtenerPolitica());
  } catch (err) { next(err); }
}

// PUT /api/politica-password -- solo super admin.
async function actualizar(req, res, next) {
  try {
    const {
      longitud_minima, requiere_mayuscula, requiere_minuscula, requiere_numero,
      requiere_caracter_especial, pista_longitud_minima, pista_similitud_maxima_porcentaje,
    } = req.body;

    const { rows } = await pool.query(
      `update politica_password set
         longitud_minima = coalesce($1, longitud_minima),
         requiere_mayuscula = coalesce($2, requiere_mayuscula),
         requiere_minuscula = coalesce($3, requiere_minuscula),
         requiere_numero = coalesce($4, requiere_numero),
         requiere_caracter_especial = coalesce($5, requiere_caracter_especial),
         pista_longitud_minima = coalesce($6, pista_longitud_minima),
         pista_similitud_maxima_porcentaje = coalesce($7, pista_similitud_maxima_porcentaje),
         updated_at = now()
       where id = 1
       returning *`,
      [longitud_minima, requiere_mayuscula, requiere_minuscula, requiere_numero, requiere_caracter_especial, pista_longitud_minima, pista_similitud_maxima_porcentaje]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23514') return res.status(400).json({ mensaje: 'Alguno de los valores esta fuera de rango.' });
    next(err);
  }
}

module.exports = { obtener, actualizar };
