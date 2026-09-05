# Migraciones pendientes / aplicadas por entorno

Registro de cambios de base de datos hechos despues del esquema inicial
(`../schema.sql`), para saber que falta correr en cada entorno. `schema.sql`
ya esta actualizado con todos los cambios (sirve para instalaciones nuevas
desde cero); estos archivos son para aplicar el delta sobre bases que ya
existian antes del cambio.

Como aplicar un archivo pendiente contra un entorno (ejemplo con Docker,
sin necesidad de instalar psql localmente):

```bash
docker run --rm -i -e PGPASSWORD='<password>' postgres:16 \
  psql -h <host> -U <usuario> -d <base> < database/migrations/00X_nombre.sql
```

## Estado por entorno

| Migracion | Descripcion | `.19` (dev) | Neon (produccion) |
|---|---|---|---|
| `001_signos_vitales.sql` | Tabla `signos_vitales` (temperatura, peso, talla/IMC, presion arterial, glucosa) ligada a `cita_id` | ✅ Aplicada 2026-09-01 | ✅ Aplicada 2026-09-02 |
| `002_glucosa_glicosilada.sql` | Columna `glucosa_glicosilada` (HbA1c, %) en `signos_vitales` | ✅ Aplicada 2026-09-01 | ✅ Aplicada 2026-09-02 |
| `003_recetas.sql` | Tablas `recetas` (cabecera) y `receta_medicamentos` (lineas), ligadas a `cita_id` | ✅ Aplicada 2026-09-02 | ✅ Aplicada 2026-09-02 |
| `004_recetas_multiples.sql` | Quita el `unique` de `recetas.cita_id`: una cita puede tener varias recetas | ✅ Aplicada 2026-09-02 | ✅ Aplicada 2026-09-02 |
| `005_pacientes_globales.sql` | `pacientes` pasa a ser global (multi-clinica), nueva tabla `pacientes_empresas` | ✅ Aplicada 2026-09-02 | ✅ Aplicada 2026-09-02 |
| `006_horarios_doctores.sql` | Nueva tabla `doctor_horarios` (patron semanal de dias/horas por doctor, para calcular disponibilidad al agendar) | ✅ Aplicada 2026-09-02 | ✅ Aplicada 2026-09-02 |
| `007_laboratorio.sql` | Nuevas tablas `ordenes_laboratorio` (cabecera) y `orden_laboratorio_examenes` (lineas) | ✅ Aplicada 2026-09-03 | ✅ Aplicada 2026-09-03 (certificado en desarrollo, promovido) |
| `008_paciente_foto.sql` | Columna `foto` (base64) en `pacientes` | ✅ Aplicada 2026-09-04 | ✅ Aplicada 2026-09-04 |
| `009_citas_reagendar.sql` | Agrega `'reagendar'` a los valores permitidos de `citas.estado` | ✅ Aplicada 2026-09-05 | ⬜ Pendiente |

**Verificado 2026-09-02**: comparacion completa de esquema (tablas, columnas,
indices, constraints, funciones, triggers) entre `.19` y Neon — identicos
(antes de aplicar la migracion 005).

Actualizar esta tabla cada vez que se agregue una migracion nueva o se
aplique una existente a un entorno adicional.
