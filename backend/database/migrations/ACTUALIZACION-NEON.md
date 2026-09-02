# Actualizacion pendiente para Neon (produccion)

Estado: `001`, `002` y `003` ya se aplicaron en Neon (2026-09-02). Queda
pendiente `004_recetas_multiples.sql`. Ver tambien [README.md](./README.md)
para el registro vivo de que esta aplicado en cada entorno.

## Resumen

| # | Migracion | Que agrega | Estado en Neon |
|---|---|---|---|
| 1 | `001_signos_vitales.sql` | Tabla nueva `signos_vitales` | ✅ Aplicada |
| 2 | `002_glucosa_glicosilada.sql` | 1 columna nueva en `signos_vitales` | ✅ Aplicada |
| 3 | `003_recetas.sql` | 2 tablas nuevas: `recetas` y `receta_medicamentos` | ✅ Aplicada |
| 4 | `004_recetas_multiples.sql` | Permite varias recetas por cita | ⬜ Pendiente |

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

## Como aplicarlo a Neon

Necesitas la cadena de conexion de Neon (Project Settings → Database →
**Direct connection**, no el pooler). Con Docker (sin instalar `psql`):

```bash
docker run --rm -i -e PGPASSWORD='<password-neon>' postgres:16 \
  psql -h <host-neon> -U <usuario-neon> -d <base-neon> < backend/database/migrations/004_recetas_multiples.sql
```

## Verificacion despues de aplicar

```sql
select conname from pg_constraint where conrelid = 'recetas'::regclass;
-- "recetas_cita_id_key" ya NO debe aparecer

\d recetas   -- confirmar que existe el indice idx_recetas_cita (no unique)
```

## Riesgo / reversibilidad

`drop constraint if exists` es seguro de re-ejecutar (no falla si ya se
quito). No borra datos ni afecta las recetas ya existentes: simplemente
deja de exigir que `cita_id` sea unico. El backend/frontend desplegados en
Render ya no usan las rutas viejas (`/citas/:citaId/receta` singular) desde
este cambio, asi que hay que desplegar el codigo nuevo junto con esta
migracion para que quede consistente.
