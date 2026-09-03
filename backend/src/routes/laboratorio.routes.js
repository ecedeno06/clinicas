const router = require('express').Router();
const ctrl = require('../controllers/laboratorio.controller');
const { requireAuth, requireEmpresa, requireRol } = require('../middleware/auth');

router.use(requireAuth, requireEmpresa);

// Ordenes pendientes de toda la clinica (card del tablero). Debe ir antes
// de '/:ordenId' para que Express no la confunda con un id.
router.get('/pendientes', requireRol('admin', 'doctor'), ctrl.listarPendientes);

// Una orden de laboratorio puntual (no ligada a la ruta de la cita, porque
// una cita puede tener varias): confidencial, solo admin y doctor.
router.put('/:ordenId', requireRol('admin', 'doctor'), ctrl.actualizar);
router.delete('/:ordenId', requireRol('admin', 'doctor'), ctrl.eliminar);

module.exports = router;
