const router = require('express').Router();
const ctrl = require('../controllers/politicaPassword.controller');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');

// Publico -- ver comentario en politicaPassword.controller.js#obtener.
router.get('/', ctrl.obtener);
router.put('/', requireAuth, requireSuperAdmin, ctrl.actualizar);

module.exports = router;
