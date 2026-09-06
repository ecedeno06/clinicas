const router = require('express').Router();
const ctrl = require('../controllers/sucursales.controller');
const { requireAuth, requireEmpresa, requireRol } = require('../middleware/auth');

// Gestion de sucursales de la clinica activa: super-admin (con clinica
// seleccionada) o el administrador de esa misma clinica -- ver
// DISENO-ZONA-HORARIA-SUCURSALES.md seccion 4.
router.use(requireAuth, requireEmpresa, requireRol('admin'));

router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.post('/', ctrl.crear);
router.put('/:id', ctrl.actualizar);

module.exports = router;
