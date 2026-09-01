const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ mensaje: 'Token no proporcionado' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = payload; // { id, nombre, email, rol, empresa_id, es_super_admin } o { id, nombre, email, parcial: true }
    next();
  } catch (err) {
    return res.status(401).json({ mensaje: 'Token invalido o expirado' });
  }
}

function requireRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ mensaje: 'No tienes permisos para esta accion' });
    }
    next();
  };
}

// Deja disponible req.empresaId a partir de la clinica activa del token.
// Bloquea tokens parciales (login pendiente de seleccionar clinica) y a
// usuarios sin ninguna clinica activa asociada.
function requireEmpresa(req, res, next) {
  if (!req.usuario || !req.usuario.empresa_id) {
    return res.status(403).json({ mensaje: 'La sesion no tiene una clinica activa seleccionada' });
  }
  req.empresaId = req.usuario.empresa_id;
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.usuario || !req.usuario.es_super_admin) {
    return res.status(403).json({ mensaje: 'Requiere permisos de super administrador' });
  }
  next();
}

module.exports = { requireAuth, requireRol, requireEmpresa, requireSuperAdmin };
