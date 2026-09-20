const router = require('express').Router();
const ctrl = require('../controllers/portalPaciente.controller');
const { requireAuth, requireRol } = require('../middleware/auth');

// Portal del paciente: unicas rutas a las que el rol 'paciente' tiene
// acceso -- ver portalPaciente.controller.js. Sin requireEmpresa: la
// sesion de un paciente no tiene clinica activa (agrega todas las que lo
// autorizan), asi que ningun controller de aqui usa req.empresaId.
router.use(requireAuth, requireRol('paciente'));

router.get('/perfil', ctrl.perfil);
router.put('/perfil', ctrl.actualizar);
router.get('/citas', ctrl.citas);
router.get('/citas/:citaId/signos-vitales', ctrl.signosVitalesDeCita);
router.get('/citas/:citaId/recetas', ctrl.recetasDeCita);
router.get('/citas/:citaId/laboratorio', ctrl.laboratorioDeCita);
router.get('/clinicas', ctrl.clinicas);
router.post('/clinicas/:empresaId/revocar-consentimiento', ctrl.revocarConsentimiento);
router.post('/clinicas/:empresaId/solicitar-consentimiento', ctrl.solicitarConsentimiento);

module.exports = router;
