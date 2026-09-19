const router = require('express').Router();
const ctrl = require('../controllers/auditoria.controller');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');

// Auditoria de sesiones: solo super-admin, global (sin requireEmpresa).
router.use(requireAuth, requireSuperAdmin);

router.get('/sesiones', ctrl.listarSesiones);

module.exports = router;
