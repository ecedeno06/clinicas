const router = require('express').Router();
const ctrl = require('../controllers/pacientes.controller');
const antecedentesCtrl = require('../controllers/pacienteAntecedentes.controller');
const { requireAuth, requireEmpresa, requireRol } = require('../middleware/auth');

router.use(requireAuth, requireEmpresa);

router.get('/', ctrl.listar);
router.get('/buscar', ctrl.buscarPorIdentificacion);
router.get('/:id', ctrl.obtener);
router.get('/:id/historial', ctrl.historial);
router.get('/:id/signos-vitales-historial', ctrl.signosVitalesHistorial);
router.get('/:id/laboratorio-historial', ctrl.laboratorioHistorial);
router.get('/:id/recetas-historial', ctrl.recetasHistorial);
// Antecedentes patologicos del paciente (catalogo global, migracion 036):
// cualquiera de la clinica puede listar/agregar, pero editar/eliminar un
// antecedente puntual esta restringido a quien lo creo -- ver
// paciente-antecedentes/:id en pacienteAntecedentes.routes.js.
router.get('/:id/antecedentes', antecedentesCtrl.listar);
router.post('/:id/antecedentes', antecedentesCtrl.crear);
router.post('/', requireRol('admin', 'recepcionista'), ctrl.crear);
router.put('/:id', requireRol('admin', 'recepcionista'), ctrl.actualizar);
router.delete('/:id', requireRol('admin'), ctrl.eliminar);

module.exports = router;
