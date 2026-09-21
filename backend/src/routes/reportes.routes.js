const router = require('express').Router();
const ctrl = require('../controllers/reportes.controller');
const { requireAuth, requireEmpresa, requireRol } = require('../middleware/auth');

// Mismo criterio que campanas.routes.js: solo rol 'admin' en la clinica
// activa (coincide con quien ve la seccion "Reportes" en el menu, ver
// layout.component.html).
router.use(requireAuth, requireEmpresa, requireRol('admin'));

router.get('/diagnosticos/mapa-calor', ctrl.mapaCalorDiagnosticos);
router.get('/diagnosticos', ctrl.diagnosticos);
router.get('/medicamentos', ctrl.medicamentos);
router.get('/laboratorios', ctrl.laboratorios);

module.exports = router;
