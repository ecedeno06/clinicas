const router = require('express').Router();
const ctrl = require('../controllers/examenesLaboratorioCatalogo.controller');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');

// Catalogo global: lectura para cualquier usuario logueado (de cualquier
// clinica), escritura solo para super admin.
router.use(requireAuth);

router.get('/', ctrl.listar);
router.post('/', requireSuperAdmin, ctrl.crear);
router.put('/:id', requireSuperAdmin, ctrl.actualizar);
router.delete('/:id', requireSuperAdmin, ctrl.eliminar);

module.exports = router;
