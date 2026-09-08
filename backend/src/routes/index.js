const router = require('express').Router();

router.use('/auth', require('./auth.routes'));
router.use('/empresas', require('./empresas.routes'));
router.use('/sucursales', require('./sucursales.routes'));
router.use('/campanas', require('./campanas.routes'));
router.use('/usuarios', require('./usuarios.routes'));
router.use('/especialidades', require('./especialidades.routes'));
router.use('/pacientes', require('./pacientes.routes'));
router.use('/doctores', require('./doctores.routes'));
router.use('/citas', require('./citas.routes'));
router.use('/recetas', require('./recetas.routes'));
router.use('/horarios', require('./doctorHorarios.routes'));
router.use('/laboratorio', require('./laboratorio.routes'));
router.use('/geocodificacion', require('./geocodificacion.routes'));

module.exports = router;
