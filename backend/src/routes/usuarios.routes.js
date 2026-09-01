const router = require('express').Router();
const ctrl = require('../controllers/usuarios.controller');
const { requireAuth, requireEmpresa, requireRol } = require('../middleware/auth');

router.use(requireAuth, requireEmpresa, requireRol('admin'));

router.get('/', ctrl.listar);
router.get('/buscar', ctrl.buscarPorEmail); // antes de /:id
router.get('/:id', ctrl.obtener);
router.post('/', ctrl.crear);
router.put('/:id', ctrl.actualizar);
router.delete('/:id', ctrl.eliminar);

module.exports = router;
