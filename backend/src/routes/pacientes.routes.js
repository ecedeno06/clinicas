const router = require('express').Router();
const ctrl = require('../controllers/pacientes.controller');
const antecedentesCtrl = require('../controllers/pacienteAntecedentes.controller');
const { requireAuth, requireEmpresa, requireRol, requireSuperAdmin } = require('../middleware/auth');

// Este router es de gestion clinica (staff): el rol 'paciente' no accede
// aqui, solo a su propio portal (ver portalPaciente.routes.js).
router.use(requireAuth, requireEmpresa, requireRol('admin', 'doctor', 'recepcionista'));

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
// Un paciente ya existente solo lo puede modificar el propio paciente
// (portal-paciente.routes.js, ruta separada) o el super admin -- el staff
// normal solo puede CREAR pacientes nuevos, no editar uno ya guardado.
router.put('/:id', requireSuperAdmin, ctrl.actualizar);
router.delete('/:id', requireRol('admin'), ctrl.eliminar);
router.post('/:id/invitar', requireRol('admin', 'doctor'), ctrl.invitar);
router.delete('/:id/invitar', requireRol('admin', 'doctor'), ctrl.desinvitar);
// Corregir el correo de LOGIN (no el de contacto) es mas sensible que
// invitar/resetear password -- se restringe a admin.
router.put('/:id/correo-acceso', requireRol('admin'), ctrl.cambiarCorreoAcceso);
router.post('/:id/resetear-password', requireRol('admin', 'doctor'), ctrl.resetearPassword);
router.post('/:id/consentimiento-datos', requireRol('admin'), ctrl.solicitarConsentimientoDatos);
router.delete('/:id/consentimiento-datos', requireRol('admin'), ctrl.rechazarConsentimientoDatos);

module.exports = router;
