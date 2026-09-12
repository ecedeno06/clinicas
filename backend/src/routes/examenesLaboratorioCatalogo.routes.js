const router = require('express').Router();
const ctrl = require('../controllers/examenesLaboratorioCatalogo.controller');
const { requireAuth, requireEmpresa, requireRol } = require('../middleware/auth');

// Mismo criterio que categoriasExamenesLaboratorio.routes.js.
router.use(requireAuth, requireEmpresa);

router.get('/', ctrl.listar);
router.post('/', requireRol('admin'), ctrl.crear);
router.put('/:id', requireRol('admin'), ctrl.actualizar);
router.delete('/:id', requireRol('admin'), ctrl.eliminar);

module.exports = router;
