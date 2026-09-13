const router = require('express').Router();
const ctrl = require('../controllers/pacienteAntecedentes.controller');
const { requireAuth, requireEmpresa, requireRol } = require('../middleware/auth');

// Un antecedente puntual (no ligado a la ruta del paciente, mismo criterio
// que /recetas/:recetaId): editar/eliminar estan restringidos a quien lo
// creo -- ver pacienteAntecedentes.controller.js#puedeModificar. Router de
// gestion clinica (staff): el rol 'paciente' no accede aqui.
router.use(requireAuth, requireEmpresa, requireRol('admin', 'doctor', 'recepcionista'));

router.put('/:id', ctrl.actualizar);
router.delete('/:id', ctrl.eliminar);

module.exports = router;
