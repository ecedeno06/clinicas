const router = require('express').Router();

router.use('/auth', require('./auth.routes'));
router.use('/empresas', require('./empresas.routes'));
router.use('/usuarios', require('./usuarios.routes'));
router.use('/especialidades', require('./especialidades.routes'));
router.use('/pacientes', require('./pacientes.routes'));
router.use('/doctores', require('./doctores.routes'));
router.use('/citas', require('./citas.routes'));

module.exports = router;
