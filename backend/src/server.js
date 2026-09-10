require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const apiRoutes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { asegurarSuperAdminInicial } = require('./utils/bootstrapSuperAdmin');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

app.get('/health', (req, res) => res.json({ ok: true, servicio: 'clinica-medica-backend' }));

app.use('/api', apiRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3001;
// Si falla (ej. la base de datos aun no responde), no debe impedir que el
// servidor arranque -- solo se loguea y se sigue.
asegurarSuperAdminInicial()
  .catch((err) => console.error('No se pudo verificar/crear el super administrador inicial:', err.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`API escuchando en http://localhost:${PORT}`);
    });
  });
