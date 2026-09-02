const router = require('express').Router();
const ctrl = require('../controllers/pacientes.controller');
const { requireAuth, requireEmpresa, requireRol } = require('../middleware/auth');

router.use(requireAuth, requireEmpresa);

router.get('/', ctrl.listar);
router.get('/buscar', ctrl.buscarPorIdentificacion);
router.get('/:id', ctrl.obtener);
router.get('/:id/historial', ctrl.historial);
router.post('/', requireRol('admin', 'recepcionista'), ctrl.crear);
router.put('/:id', requireRol('admin', 'recepcionista'), ctrl.actualizar);
router.delete('/:id', requireRol('admin'), ctrl.eliminar);

module.exports = router;
