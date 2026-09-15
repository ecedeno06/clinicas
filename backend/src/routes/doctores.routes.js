const router = require('express').Router();
const ctrl = require('../controllers/doctores.controller');
const horariosCtrl = require('../controllers/doctorHorarios.controller');
const { requireAuth, requireEmpresa, requireRol } = require('../middleware/auth');

// Router de gestion clinica (staff): el rol 'paciente' no accede aqui.
router.use(requireAuth, requireEmpresa, requireRol('admin', 'doctor', 'recepcionista'));

router.get('/', ctrl.listar);
router.get('/buscar', ctrl.buscarPorIdentificacion);
// Portal del doctor: sus propios datos + en que clinicas tiene rol
// 'doctor' -- antes de "/:id" para que "mi-perfil" no se confunda con un id.
router.get('/mi-perfil', ctrl.miPerfil);
router.get('/:id', ctrl.obtener);
router.post('/', requireRol('admin'), ctrl.crear);
router.put('/:id', requireRol('admin'), ctrl.actualizar);
router.delete('/:id', requireRol('admin'), ctrl.eliminar);
// Dar/quitar acceso al sistema (rol 'doctor') y resetear su contrasena --
// solo admin: es una accion administrativa, no algo que un doctor haga
// sobre otro (a diferencia de invitar-paciente, que si permite doctor).
router.post('/:id/invitar', requireRol('admin'), ctrl.invitar);
router.delete('/:id/invitar', requireRol('admin'), ctrl.desinvitar);
router.post('/:id/resetear-password', requireRol('admin'), ctrl.resetearPassword);

// Disponibilidad calculada (horario semanal - citas ya agendadas ese dia).
router.get('/:id/disponibilidad', horariosCtrl.disponibilidad);

// Horario semanal recurrente del doctor (tablero de turnos).
router.get('/:doctorId/horarios', horariosCtrl.listarPorDoctor);
router.post('/:doctorId/horarios', requireRol('admin'), horariosCtrl.crear);

module.exports = router;
