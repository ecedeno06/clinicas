const router = require('express').Router();
const ctrl = require('../controllers/doctores.controller');
const horariosCtrl = require('../controllers/doctorHorarios.controller');
const { requireAuth, requireEmpresa, requireRol } = require('../middleware/auth');

router.use(requireAuth, requireEmpresa);

router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.post('/', requireRol('admin'), ctrl.crear);
router.put('/:id', requireRol('admin'), ctrl.actualizar);
router.delete('/:id', requireRol('admin'), ctrl.eliminar);

// Disponibilidad calculada (horario semanal - citas ya agendadas ese dia).
router.get('/:id/disponibilidad', horariosCtrl.disponibilidad);

// Horario semanal recurrente del doctor (tablero de turnos).
router.get('/:doctorId/horarios', horariosCtrl.listarPorDoctor);
router.post('/:doctorId/horarios', requireRol('admin'), horariosCtrl.crear);

module.exports = router;
