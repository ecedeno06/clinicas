const router = require('express').Router();
const ctrl = require('../controllers/doctorHorarios.controller');
const { requireAuth, requireEmpresa, requireRol } = require('../middleware/auth');

// Router de gestion clinica (staff): el rol 'paciente' no accede aqui.
router.use(requireAuth, requireEmpresa, requireRol('admin', 'doctor', 'recepcionista'));

// Un bloque de horario puntual (no ligado a la ruta del doctor, igual que
// recetas.routes.js con las citas). 'doctor' se deja pasar para que el
// dueno de la jornada pueda gestionar la suya -- el controller decide con
// mas detalle via puedeGestionarHorario (el doctor puede tocar cualquiera
// de las suyas, un admin normal solo las de su clinica activa).
router.put('/:id', requireRol('admin', 'doctor'), ctrl.actualizar);
router.delete('/:id', requireRol('admin', 'doctor'), ctrl.eliminar);

module.exports = router;
