const router = require('express').Router();
const ctrl = require('../controllers/citas.controller');
const historiaCtrl = require('../controllers/historiasClinicas.controller');
const { requireAuth, requireEmpresa, requireRol } = require('../middleware/auth');

router.use(requireAuth, requireEmpresa);

router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.post('/', requireRol('admin', 'recepcionista'), ctrl.crear);
router.put('/:id', requireRol('admin', 'recepcionista'), ctrl.actualizar);
router.delete('/:id', requireRol('admin'), ctrl.eliminar);

// Historia clinica de una cita puntual: confidencial, solo admin y doctor.
router.get('/:citaId/historia', requireRol('admin', 'doctor'), historiaCtrl.obtenerPorCita);
router.post('/:citaId/historia', requireRol('admin', 'doctor'), historiaCtrl.crear);
router.put('/:citaId/historia', requireRol('admin', 'doctor'), historiaCtrl.actualizar);

module.exports = router;
