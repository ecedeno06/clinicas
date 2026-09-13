const router = require('express').Router();
const ctrl = require('../controllers/geocodificacion.controller');
const { requireAuth, requireEmpresa, requireRol } = require('../middleware/auth');

// Staff Y el propio paciente (edita sus direcciones desde el portal, ver
// portal-paciente/perfil-paciente.component.ts) pueden detectar la
// division politica de un punto -- no expone datos de otros pacientes,
// solo hace de proxy hacia Google.
router.use(requireAuth, requireEmpresa, requireRol('admin', 'doctor', 'recepcionista', 'paciente'));

router.get('/reverse', ctrl.reverseGeocode);

module.exports = router;
