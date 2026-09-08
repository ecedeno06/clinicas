const router = require('express').Router();
const ctrl = require('../controllers/geocodificacion.controller');
const { requireAuth, requireEmpresa } = require('../middleware/auth');

router.use(requireAuth, requireEmpresa);

router.get('/reverse', ctrl.reverseGeocode);

module.exports = router;
