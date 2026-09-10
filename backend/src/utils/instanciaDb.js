// Nombre de la base de datos a la que esta conectado el backend, mostrado
// en el header del dashboard para saber a simple vista en que entorno se
// esta trabajando (evita confusiones como dejar DATABASE_URL apuntando a
// la base equivocada sin darse cuenta). Se toma directo del nombre de la
// base en DATABASE_URL (ej. "clinica-dev", "clinica" en Neon) -- no hace
// falta configurar nada aparte. DB_INSTANCE_NAME (env, opcional) lo
// sobreescribe si se quiere mostrar un nombre distinto.
function nombreInstanciaDb() {
  if (process.env.DB_INSTANCE_NAME) return process.env.DB_INSTANCE_NAME;

  try {
    return new URL(process.env.DATABASE_URL).pathname.replace(/^\//, '') || 'desconocida';
  } catch {
    return 'desconocida';
  }
}

module.exports = { nombreInstanciaDb };
