const router = require('express').Router();
const ctrl = require('../controllers/empresas.controller');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');

// Gestion de clinicas: solo super-admin
router.use(requireAuth, requireSuperAdmin);

router.get('/', ctrl.listar);
router.get('/usuarios-globales', ctrl.listarUsuariosGlobales); // antes de /:id
router.get('/:id', ctrl.obtener);
router.post('/', ctrl.crear);
router.put('/:id', ctrl.actualizar);
router.delete('/:id', ctrl.eliminar);

router.get('/:id/usuarios', ctrl.listarUsuariosDeEmpresa);
router.post('/:id/usuarios', ctrl.asociarUsuario);
router.delete('/:id/usuarios/:usuarioId', ctrl.desasociarUsuario);

module.exports = router;
