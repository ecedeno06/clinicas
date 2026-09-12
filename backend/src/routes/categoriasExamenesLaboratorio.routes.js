const router = require('express').Router();
const ctrl = require('../controllers/categoriasExamenesLaboratorio.controller');
const { requireAuth, requireEmpresa, requireRol } = require('../middleware/auth');

// Lectura: cualquier usuario logueado ve el catalogo global + el propio
// de su clinica activa. Escritura: requiere rol admin en la clinica
// activa (un super admin siempre lo tiene, ver auth.controller.js
// seleccionarEmpresa) -- el controller valida ademas si la fila es
// global o de otra clinica.
router.use(requireAuth, requireEmpresa);

router.get('/', ctrl.listar);
router.post('/', requireRol('admin'), ctrl.crear);
router.put('/:id', requireRol('admin'), ctrl.actualizar);
router.delete('/:id', requireRol('admin'), ctrl.eliminar);

module.exports = router;
