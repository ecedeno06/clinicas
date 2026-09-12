const router = require('express').Router();
const ctrl = require('../controllers/sucursales.controller');
const { requireAuth, requireEmpresa, requireRol } = require('../middleware/auth');

// Lectura: cualquier usuario logueado de la clinica (un recepcionista
// necesita listar sucursales para agendar una cita). Escritura: solo
// super-admin (con clinica seleccionada) o el administrador de esa
// misma clinica -- ver DISENO-ZONA-HORARIA-SUCURSALES.md seccion 4.
router.use(requireAuth, requireEmpresa);

router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.post('/', requireRol('admin'), ctrl.crear);
router.put('/:id', requireRol('admin'), ctrl.actualizar);

module.exports = router;
