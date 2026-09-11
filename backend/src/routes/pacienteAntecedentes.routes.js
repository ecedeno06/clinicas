const router = require('express').Router();
const ctrl = require('../controllers/pacienteAntecedentes.controller');
const { requireAuth, requireEmpresa } = require('../middleware/auth');

// Un antecedente puntual (no ligado a la ruta del paciente, mismo criterio
// que /recetas/:recetaId): editar/eliminar estan restringidos a quien lo
// creo -- ver pacienteAntecedentes.controller.js#puedeModificar.
router.use(requireAuth, requireEmpresa);

router.put('/:id', ctrl.actualizar);
router.delete('/:id', ctrl.eliminar);

module.exports = router;
