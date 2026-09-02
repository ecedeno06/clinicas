const router = require('express').Router();
const ctrl = require('../controllers/recetas.controller');
const { requireAuth, requireEmpresa, requireRol } = require('../middleware/auth');

router.use(requireAuth, requireEmpresa);

// Una receta puntual (no ligada a la ruta de la cita, porque una cita puede
// tener varias): confidencial, solo admin y doctor.
router.put('/:recetaId', requireRol('admin', 'doctor'), ctrl.actualizar);
router.delete('/:recetaId', requireRol('admin', 'doctor'), ctrl.eliminar);

module.exports = router;
