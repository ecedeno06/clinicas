const router = require('express').Router();
const ctrl = require('../controllers/citas.controller');
const historiaCtrl = require('../controllers/historiasClinicas.controller');
const signosVitalesCtrl = require('../controllers/signosVitales.controller');
const recetasCtrl = require('../controllers/recetas.controller');
const laboratorioCtrl = require('../controllers/laboratorio.controller');
const { requireAuth, requireEmpresa, requireRol } = require('../middleware/auth');

// Router de gestion clinica (staff): el rol 'paciente' no accede aqui.
router.use(requireAuth, requireEmpresa, requireRol('admin', 'doctor', 'recepcionista'));

router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
// 'doctor' puede crear -- el controller (crear()) fuerza doctor_id al
// propio, ignorando cualquier otro que venga en el body.
router.post('/', requireRol('admin', 'recepcionista', 'doctor'), ctrl.crear);
// 'doctor' puede actualizar -- el controller (actualizar()) restringe a
// que solo sea una cita propia.
router.put('/:id', requireRol('admin', 'recepcionista', 'doctor'), ctrl.actualizar);
router.delete('/:id', requireRol('admin'), ctrl.eliminar);

// Historia clinica de una cita puntual: confidencial, solo admin y doctor.
router.get('/:citaId/historia', requireRol('admin', 'doctor'), historiaCtrl.obtenerPorCita);
router.post('/:citaId/historia', requireRol('admin', 'doctor'), historiaCtrl.crear);
router.put('/:citaId/historia', requireRol('admin', 'doctor'), historiaCtrl.actualizar);

// Signos vitales de una cita puntual: los toma recepcion/enfermeria al llegar
// el paciente, independiente de si el doctor ya creo la historia clinica.
router.get('/:citaId/signos-vitales', requireRol('admin', 'doctor', 'recepcionista'), signosVitalesCtrl.obtenerPorCita);
router.post('/:citaId/signos-vitales', requireRol('admin', 'doctor', 'recepcionista'), signosVitalesCtrl.crear);
router.put('/:citaId/signos-vitales', requireRol('admin', 'doctor', 'recepcionista'), signosVitalesCtrl.actualizar);

// Recetas de una cita puntual: confidencial, solo admin y doctor (igual que
// la historia clinica). Una cita puede tener varias recetas.
router.get('/:citaId/recetas', requireRol('admin', 'doctor'), recetasCtrl.listarPorCita);
router.post('/:citaId/recetas', requireRol('admin', 'doctor'), recetasCtrl.crear);

// Ordenes de laboratorio de una cita puntual: confidencial, solo admin y
// doctor (igual que recetas). Una cita puede tener varias ordenes.
router.get('/:citaId/laboratorio', requireRol('admin', 'doctor'), laboratorioCtrl.listarPorCita);
router.post('/:citaId/laboratorio', requireRol('admin', 'doctor'), laboratorioCtrl.crear);

module.exports = router;
