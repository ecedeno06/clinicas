const router = require('express').Router();
const ctrl = require('../controllers/consentimientoDatos.controller');

// 100% publico -- se llega por un link de correo sin sesion, ver
// pacientes.controller.js#solicitarConsentimientoDatos.
router.get('/:token', ctrl.obtener);
router.post('/responder', ctrl.responder);

module.exports = router;
