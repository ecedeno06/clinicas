const router = require('express').Router();
const ctrl = require('../controllers/campanas.controller');
const { requireAuth, requireEmpresa, requireRol } = require('../middleware/auth');

// Gestion de campanas: por ahora solo admin (super-admin con clinica
// seleccionada, o el administrador de esa misma clinica). Una vista de
// solo-lectura para doctores queda para la Fase 2 (UI).
router.use(requireAuth, requireEmpresa, requireRol('admin'));

router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.post('/', ctrl.crear);
router.put('/:id', ctrl.actualizar);
router.put('/:id/estado', ctrl.cambiarEstado);

router.get('/:id/doctores', ctrl.listarDoctores);
router.post('/:id/doctores', ctrl.invitarDoctor);
router.put('/:id/doctores/:doctorId', ctrl.actualizarDoctor);
router.delete('/:id/doctores/:doctorId', ctrl.quitarDoctor);

module.exports = router;
