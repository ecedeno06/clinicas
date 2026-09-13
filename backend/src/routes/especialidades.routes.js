const router = require('express').Router();
const ctrl = require('../controllers/especialidades.controller');
const { requireAuth, requireEmpresa, requireRol } = require('../middleware/auth');

// Router de gestion clinica (staff): el rol 'paciente' no accede aqui.
router.use(requireAuth, requireEmpresa, requireRol('admin', 'doctor', 'recepcionista'));

router.get('/', ctrl.listar);
router.get('/globales', requireRol('admin'), ctrl.listarCatalogoGlobal);
router.get('/:id', ctrl.obtener);
router.post('/', requireRol('admin'), ctrl.crear);
router.put('/:id', requireRol('admin'), ctrl.actualizar);
router.delete('/:id', requireRol('admin'), ctrl.eliminar);

module.exports = router;
