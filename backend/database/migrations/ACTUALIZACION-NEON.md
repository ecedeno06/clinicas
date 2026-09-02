# Actualizacion pendiente para Neon (produccion)

Estado: `001` a `004` ya se aplicaron en Neon (2026-09-02, verificado con
comparacion completa de esquema contra `.19`). Queda pendiente
`005_pacientes_globales.sql`. Ver tambien [README.md](./README.md) para el
registro vivo de que esta aplicado en cada entorno.

## Resumen

| # | Migracion | Que agrega | Estado en Neon |
|---|---|---|---|
| 1 | `001_signos_vitales.sql` | Tabla nueva `signos_vitales` | ✅ Aplicada |
| 2 | `002_glucosa_glicosilada.sql` | 1 columna nueva en `signos_vitales` | ✅ Aplicada |
| 3 | `003_recetas.sql` | 2 tablas nuevas: `recetas` y `receta_medicamentos` | ✅ Aplicada |
| 4 | `004_recetas_multiples.sql` | Permite varias recetas por cita | ✅ Aplicada |
| 5 | `005_pacientes_globales.sql` | `pacientes` pasa a ser global (multi-clinica) | ⬜ Pendiente |

---

## 4. `004_recetas_multiples.sql` — Varias recetas por cita

El diseño original limitaba a **una receta por cita** (`unique` en
`recetas.cita_id`). En la practica el doctor puede emitir mas de una receta
en la misma consulta, asi que se quita esa restriccion:

```sql
alter table recetas drop constraint if exists recetas_cita_id_key;
create index if not exists idx_recetas_cita on recetas(cita_id);
```

Esto tambien cambio el backend: antes `PUT`/`GET` de receta vivian bajo
`/citas/:citaId/receta` (una sola); ahora `GET`/`POST` de la lista siguen
bajo `/citas/:citaId/recetas` (plural), pero `PUT`/`DELETE` de una receta
puntual pasaron a `/recetas/:recetaId` (recurso propio), porque ya no hay
una unica receta por cita a la cual referirse implicitamente.

Validado con Postgres desechable: se simulo el estado actual de Neon (con
el `unique` todavia activo), se confirmo que una segunda receta para la
misma cita fallaba con `duplicate key value violates unique constraint
"recetas_cita_id_key"`, se aplico la migracion, y se confirmo que despues
la segunda receta se inserta sin problema.

---

## 5. `005_pacientes_globales.sql` — Paciente global (multi-clinica)

Cambio de modelo: `pacientes` deja de pertenecer a una sola clinica. Ahora
es una identidad global (misma logica que `usuarios`), y una nueva tabla
`pacientes_empresas` (N:M, paralela a `usuarios_empresas_rol`) vincula esa
identidad con cada clinica donde el paciente es atendido.

**Que hace la migracion, en orden:**
1. Crea `pacientes_empresas` (paciente_id, empresa_id, activo).
2. Migra cada `pacientes.empresa_id`/`activo` existente a un vinculo en
   la tabla nueva.
3. **Deduplica** pacientes con la misma `identificacion` registrados por
   separado en distintas clinicas antes de este cambio: fusiona las filas
   en una sola (conservando la mas antigua), reapunta `citas`,
   `historias_clinicas`, `signos_vitales` y `recetas` de las filas
   duplicadas hacia la sobreviviente, y traslada los vinculos de clinica.
   *(Verificado: no habia ningun caso real en `.19` ni en Neon al momento
   de escribir esta migracion, pero el bloque corre igual como
   salvaguarda -- probado por separado con datos sinteticos que si
   duplicaban).*
4. Quita `empresa_id` y `activo` de `pacientes` (ahora en
   `pacientes_empresas`).
5. Vuelve `identificacion` y `email` **unicos globalmente** en `pacientes`
   (antes `identificacion` era unico solo por clinica).

**Cambio de comportamiento importante**: al registrar un paciente nuevo,
el backend ahora busca primero por `identificacion` en toda la red
(`GET /api/pacientes/buscar?identificacion=`). Si ya existe, no se crea un
registro duplicado — se reutiliza el existente (nombre, alergias, contacto
de emergencia, etc.) y solo se crea el vinculo con la clinica actual. El
frontend muestra un aviso y bloquea esos campos para edicion accidental
cuando detecta la coincidencia.

**Lo que NO cambia**: el aislamiento de datos clinicos entre clinicas.
`citas`, `historias_clinicas`, `signos_vitales` y `recetas` ya filtraban
por su propio `empresa_id` — eso sigue igual. El personal de una clinica
sigue sin ver el historial que el mismo paciente tiene en otra.

Ver [DISENO-PACIENTE-GLOBAL.md](../../../DISENO-PACIENTE-GLOBAL.md) para
el diseño completo, incluyendo lo que falta (portal del paciente, login
propio, invitacion por correo) que NO forma parte de esta migracion.

---

## Como aplicarlo a Neon

Necesitas la cadena de conexion de Neon (Project Settings → Database →
**Direct connection**, no el pooler). Con Docker (sin instalar `psql`):

```bash
docker run --rm -i -e PGPASSWORD='<password-neon>' postgres:16 \
  psql -h <host-neon> -U <usuario-neon> -d <base-neon> < backend/database/migrations/005_pacientes_globales.sql
```

**Recomendado**: antes de correrla, ejecutar el analisis de duplicados por
separado contra Neon para confirmar que sigue en cero (puede haber
cambiado desde que se escribio este documento si se agregaron pacientes
nuevos):
```sql
select identificacion, count(*) from pacientes
where identificacion is not null and identificacion <> ''
group by identificacion having count(*) > 1;
```

## Verificacion despues de aplicar

```sql
\d pacientes   -- empresa_id y activo ya no deben aparecer; identificacion
               -- y email deben mostrar "UNIQUE CONSTRAINT"

select count(*) from pacientes_empresas;  -- debe ser >= al total de pacientes que habia antes
```

## Riesgo / reversibilidad

Los pasos 1-3 (crear tabla, migrar vinculos, deduplicar) son aditivos y
seguros. Los pasos 4-5 (quitar columnas, agregar unique) son los que
requieren mas cuidado: si Neon llegara a tener pacientes duplicados por
identificacion que el paso 3 no lograra fusionar por algun motivo, el
`alter table ... add constraint unique` del paso 5 fallaria limpio (no deja
la tabla a medio migrar) — en ese caso, revisar el resultado de la consulta
de duplicados de arriba antes de reintentar. El backend desplegado en
Render debe actualizarse junto con esta migracion: las queries viejas de
`pacientes.controller.js` (que filtraban por `empresa_id` directo en la
tabla) dejan de funcionar en cuanto se quita esa columna.
