const router = require('express').Router();
const {
  login,
  verificar2FA,
  setup2FA,
  enable2FA,
  disable2FA,
  logout,
  refrescarToken,
  olvidoPassword,
  restablecerPassword,
  solicitarRecuperacion2FA,
  confirmarRecuperacion2FA,
  obtenerPista,
  sessionConfig,
  seleccionarEmpresa,
  misEmpresas,
  me,
  actualizarPerfil,
  cambiarPassword,
} = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');
const rateLimitPista = require('../middleware/rateLimitPista');
const rateLimitOlvidoPassword = require('../middleware/rateLimitOlvidoPassword');
const rateLimitRecuperacion2FA = require('../middleware/rateLimitRecuperacion2FA');

router.post('/login', login);
router.post('/2fa/verify-login', verificar2FA);
router.post('/refresh', refrescarToken);
router.post('/forgot-password', rateLimitOlvidoPassword, olvidoPassword);
router.post('/reset-password', restablecerPassword);
router.post('/2fa/recovery', rateLimitRecuperacion2FA, solicitarRecuperacion2FA);
router.post('/2fa/recovery/confirm', confirmarRecuperacion2FA);
router.get('/pista', rateLimitPista, obtenerPista);
router.get('/session-config', sessionConfig);
router.post('/seleccionar-empresa', requireAuth, seleccionarEmpresa);
router.post('/logout', logout);
router.post('/2fa/setup', requireAuth, setup2FA);
router.post('/2fa/enable', requireAuth, enable2FA);
router.post('/2fa/disable', requireAuth, disable2FA);
router.get('/mis-empresas', requireAuth, misEmpresas);
router.get('/me', requireAuth, me);
router.put('/me', requireAuth, actualizarPerfil);
router.put('/password', requireAuth, cambiarPassword);

module.exports = router;
