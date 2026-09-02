const router = require('express').Router();
const ctrl = require('../controllers/doctorHorarios.controller');
const { requireAuth, requireEmpresa, requireRol } = require('../middleware/auth');

router.use(requireAuth, requireEmpresa);

// Un bloque de horario puntual (no ligado a la ruta del doctor, igual que
// recetas.routes.js con las citas).
router.put('/:id', requireRol('admin'), ctrl.actualizar);
router.delete('/:id', requireRol('admin'), ctrl.eliminar);

module.exports = router;
