# Diseno: Geocodificacion inversa (provincia/distrito/corregimiento)

> Informe de diseno. Objetivo: al elegir un punto en el selector de mapa
> (`MapaSelectorComponent`) para un paciente, poder traer automaticamente
> la division politica de Panama (provincia, distrito, corregimiento) via
> la API de Geocoding de Google, sin exponer la API key en el navegador.

Estado (2026-09-08): **Fase 0 completada** (ver seccion 3) -- se probo la
API real y se confirmo el mapeo definitivo. Nada del backend/frontend
implementado todavia (Fases 1-3 pendientes). Decisiones ya tomadas con
el usuario:
- Alcance: **solo Pacientes** (Sucursales/Campañas quedan documentadas
  como extension facil a futuro, ver seccion 7).
- Disparo: **boton separado** "Detectar division politica" (no automatico
  en cada clic/busqueda) -- el usuario decide cuando gastar una llamada a
  la API.
- La API key de Google ya se genero y se restringio a **Geocoding API
  unicamente** (Application restrictions pendiente de definir cuando se
  despliegue el backend, ver seccion 4).

---

## 1. Por que hace falta un endpoint propio en el backend

Hoy **todo el stack de mapas vive en el frontend**: `MapaSelectorComponent`
llama directo por `fetch()` a Nominatim (OpenStreetMap) y a los tiles de
Esri/OpenStreetMap -- ninguno de esos dos requiere API key, asi que no hay
ningun secreto que proteger.

La API de Google si requiere una API key, y **una API key usada desde el
navegador queda visible en cualquier request de la pestaña "Network" del
inspector** -- restringirla a "Geocoding API" (ya hecho) limita el daño
posible si se filtra, pero no lo evita: alguien podria copiarla y usarla
para geocodificar por su cuenta, generando cargos a esta cuenta de Google
Cloud.

**Decision de diseno**: la key vive *solo* en el backend (`.env`, nunca en
el bundle de Angular). El frontend nunca habla con Google directamente --
le pide a un endpoint propio (`GET /api/geocodificacion/reverse`), y es
el backend quien llama a Google con la key.

```
Hoy (Nominatim, sin key):
  Angular --fetch()--> nominatim.openstreetmap.org

Nuevo (Google, con key):
  Angular --fetch()--> nuestro backend --pool/https--> maps.googleapis.com
                         (la key solo existe aqui)
```

Esto es codigo nuevo: el backend hoy **no tiene ningun patron de proxy
hacia una API externa** (todos los controllers solo hacen `pool.query`
contra Postgres). Es el primer caso de este tipo en el proyecto.

---

## 2. Endpoint nuevo: `GET /api/geocodificacion/reverse`

```
GET /api/geocodificacion/reverse?lat=8.9824&lng=-79.5199
Authorization: Bearer <token>   (mismo middleware de auth que el resto de la API)

200 OK
{
  "provincia": "Provincia de Panamá",
  "distrito": "Panamá",
  "corregimiento": null,
  "direccion_formateada": "Calle 54 Este 15823, Panamá, Provincia de Panamá, Panamá"
}
```
(`corregimiento` casi siempre viene `null` -- ver seccion 3, Google no
provee ese nivel para Panama. El campo se deja en la respuesta por
consistencia de forma, no porque se espere que traiga dato.)

Backend (`backend/src/controllers/geocodificacion.controller.js`, nuevo):

```js
const MAPKEY = process.env.MAPKEY;

async function reverseGeocode(req, res, next) {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ mensaje: 'lat y lng son requeridos' });
    if (!MAPKEY) return res.status(500).json({ mensaje: 'Geocodificacion no configurada en el servidor' });

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${MAPKEY}&language=es&region=pa`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.status !== 'OK' || !data.results?.[0]) {
      return res.status(404).json({ mensaje: 'No se pudo determinar la division politica para ese punto' });
    }

    res.json(mapearComponentes(data.results[0].address_components));
  } catch (err) { next(err); }
}
```

`mapearComponentes()` extrae `provincia`/`distrito`/`corregimiento` de
`address_components` (ver seccion 3 sobre por que esto necesita
validarse con datos reales antes de darlo por definitivo).

Ruta (`backend/src/routes/geocodificacion.routes.js`, nuevo):
```js
router.get('/reverse', requireAuth, requireEmpresa, geocodCtrl.reverseGeocode);
```
Registrar en `backend/src/app.js` (o donde se montan las demas rutas)
igual que las existentes: `app.use('/api/geocodificacion', geocodificacionRoutes)`.

Variable de entorno nueva (`backend/.env`, **nunca** en `.env.example` con
el valor real -- solo el nombre como placeholder). Nombre ya elegido por
el usuario: `MAPKEY`.
```
MAPKEY=<la key restringida a Geocoding API>
```

**No se usa cache ni se persiste ningun log de las llamadas a Google en
esta primera fase** -- cada clic en "Detectar division politica" es una
llamada nueva. Si el volumen lo justifica mas adelante, se podria cachear
por coordenadas redondeadas (ver seccion 7).

---

## 3. Fase 0 -- resultado real contra la API (2026-09-08)

Se probo la API real (key restringida a Geocoding API) contra 5 puntos de
Panama: Bella Vista (capital), La Chorrera (Panama Oeste), David
(Chiriqui), Santiago (Veraguas), y Comarca Guna Yala (caso limite rural).
Resultado (`address_components` completo devuelto por Google):

| Punto | `administrative_area_level_1` (Provincia) | `administrative_area_level_2` (Distrito) | Corregimiento |
|---|---|---|---|
| Bella Vista | "Provincia de Panamá" | "Panamá" | **ausente** |
| La Chorrera | "Provincia de Panamá Oeste" | "La Chorrera" | **ausente** |
| David | "Provincia de Chiriquí" | "Distrito de David" | **ausente** |
| Santiago | "Provincia de Veraguas" | "Santiago" | **ausente** |
| Comarca Guna Yala | **ausente** | **ausente** | **ausente** (solo `locality: "El Porvenir"`) |

**Hallazgo clave: Google Geocoding NO devuelve el corregimiento en
NINGUNO de los 5 puntos probados** -- no aparece como
`sublocality_level_1`, `neighborhood` ni ningun otro tipo. No es un caso
raro de zonas rurales: ni siquiera aparece en Bella Vista (zona urbana
densa de la capital). Conclusion: **el campo Corregimiento va a quedar
practicamente siempre vacio si se espera que Google lo rellene** -- en la
practica, el usuario lo va a escribir a mano casi todo el tiempo. Esto no
invalida el diseno (el campo ya estaba planeado como editable, seccion 4)
pero si cambia la expectativa: el boton "Detectar division politica" hay
que presentarlo como "rellena provincia y distrito" (confiable), no como
"rellena los 3 niveles" (corregimiento casi nunca llega).

Provincia y Distrito si son confiables (presentes en 4 de 5 puntos,
ausentes solo en el caso extremo de comarca rural sin cobertura de datos
de Google). Detalle a manejar en el mapeo: `administrative_area_level_2`
a veces viene con el prefijo "Distrito de " (David) y a veces sin el
(La Chorrera, Santiago, Panama) -- hay que normalizar quitando ese
prefijo si esta presente, para que el campo se vea consistente sin
importar el distrito.

Mapeo definitivo para el controller (seccion 2):

```js
function mapearComponentes(components) {
  const buscar = (tipo) => components.find((c) => c.types.includes(tipo))?.long_name || null;
  const distrito = buscar('administrative_area_level_2');
  return {
    provincia: buscar('administrative_area_level_1'),
    distrito: distrito ? distrito.replace(/^Distrito de /i, '') : null,
    corregimiento: null, // Google no lo provee para Panama -- queda para que el usuario lo escriba a mano
    direccion_formateada: null, // se completa con components[0].formatted_address si hiciera falta
  };
}
```

---

## 4. Cambio de modelo: un paciente puede tener varias direcciones

Decision del usuario (2026-09-08): en vez de agregar provincia/distrito/
corregimiento como columnas sueltas en `pacientes` (plan original de las
secciones 2-3), la direccion pasa a vivir en una **tabla propia
`direcciones_paciente`** (1 paciente : N direcciones), con una marcada
como **principal** -- esa es la que usan Google Maps/Waze/WhatsApp al
doctor en las comunicaciones ya existentes (Ver en el mapa, Waze,
compartir con el doctor en visita a domicilio). Mismo patron de tabla
puente ya usado en el proyecto (`doctor_especialidades`,
`pacientes_empresas`): PK propia, FK con `on delete cascade`, indices,
trigger `updated_at`.

Esto **reemplaza** las columnas `pacientes.direccion`,
`pacientes.google_maps_url` y `pacientes.comparte_ubicacion` (agregadas
en las migraciones `020` y `023`) -- se migran a filas de la tabla nueva
y se eliminan de `pacientes`, mismo criterio ya aplicado en la migracion
`019` (doctor_especialidades) cuando `doctores.especialidad_id`/
`numero_colegiado` se reemplazaron por la tabla puente.

### Columnas de `direcciones_paciente`

| Columna | Tipo | Origen |
|---|---|---|
| `id` | uuid PK | nueva |
| `paciente_id` | uuid FK -> pacientes(id) on delete cascade | nueva |
| `direccion` | text | viene de `pacientes.direccion` |
| `google_maps_url` | text | viene de `pacientes.google_maps_url` |
| `pais` | text | nuevo, autopoblado por geocodificacion inversa |
| `provincia` | text | nuevo, autopoblado (confiable, ver seccion 3) |
| `distrito` | text | nuevo, autopoblado (confiable, ver seccion 3) |
| `corregimiento` | text | nuevo, **manual** casi siempre (ver seccion 3 -- Google no lo provee) |
| `comparte_ubicacion` | boolean default false | viene de `pacientes.comparte_ubicacion` (consentimiento, ahora **por direccion**, no por paciente -- una direccion puede compartirse y otra no) |
| `es_principal` | boolean default false | nuevo -- controla cual toman Google Maps/Waze/WhatsApp |
| `created_at`/`updated_at` | timestamptz | patron estandar del proyecto |

Se mantiene "pais" ademas de provincia/distrito aunque hoy todos los
pacientes son de Panama, porque no cuesta nada tenerlo y evita una
migracion futura si algun dia hiciera falta (paciente extranjero de
paso, por ejemplo). Auto-poblado igual que provincia (`country` siempre
viene en `address_components` de Google, es el tipo mas confiable de
todos).

### Regla de una sola direccion principal

Se impone con un **indice unico parcial** (no un `check`/trigger, mas
simple y a prueba de condiciones de carrera):
```sql
create unique index uq_direcciones_paciente_principal
  on direcciones_paciente(paciente_id) where es_principal;
```
Postgres permite cualquier cantidad de filas con `es_principal = false`
para un mismo paciente, pero rechaza una segunda fila con
`es_principal = true` para el mismo `paciente_id`. Marcar una direccion
distinta como principal requiere primero desmarcar la anterior (dos
`update` en una transaccion, ver Fase 2 de implementacion).

---

## 5. Plan de migracion de base de datos (on-premise `.17`)

Migracion nueva `025_direcciones_paciente.sql`, 100% siguiendo el estilo
ya usado en el proyecto (ver `019_doctor_especialidades.sql` como
plantilla mas cercana: tabla puente + backfill + eliminacion de columnas
viejas, todo en un mismo archivo, protegido para poder re-correrse sin
error):

```sql
-- Un paciente puede tener varias direcciones (casa, trabajo, etc.), una
-- marcada como principal -- esa es la que usan Google Maps/Waze/WhatsApp
-- al doctor en las comunicaciones ya existentes. Reemplaza las columnas
-- pacientes.direccion/google_maps_url/comparte_ubicacion (migraciones
-- 020 y 023), que se eliminan tras el backfill -- mismo criterio ya
-- aplicado en la migracion 019 (doctor_especialidades).

create table if not exists direcciones_paciente (
    id                 uuid primary key default gen_random_uuid(),
    paciente_id        uuid not null references pacientes(id) on delete cascade,
    direccion          text,
    google_maps_url    text,
    pais               text,
    provincia          text,
    distrito           text,
    corregimiento      text,
    comparte_ubicacion boolean not null default false,
    es_principal       boolean not null default false,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

create index if not exists idx_direcciones_paciente_paciente on direcciones_paciente(paciente_id);

-- Como maximo una direccion principal por paciente.
create unique index if not exists uq_direcciones_paciente_principal
  on direcciones_paciente(paciente_id) where es_principal;

drop trigger if exists trg_set_updated_at on direcciones_paciente;
create trigger trg_set_updated_at before update on direcciones_paciente for each row execute function set_updated_at();

-- Backfill (cada paciente con direccion/google_maps_url actuales pasa a
-- una fila marcada como principal) + limpieza de las columnas viejas.
-- Protegido con el chequeo de columna para poder re-correr esta
-- migracion sin error una vez ya aplicada (mismo patron que 019).
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_name = 'pacientes' and column_name = 'google_maps_url'
    ) then
        insert into direcciones_paciente (paciente_id, direccion, google_maps_url, comparte_ubicacion, es_principal)
        select id, direccion, google_maps_url, coalesce(comparte_ubicacion, false), true
        from pacientes p
        where (direccion is not null or google_maps_url is not null)
          and not exists (select 1 from direcciones_paciente dp where dp.paciente_id = p.id);

        alter table pacientes drop column direccion;
        alter table pacientes drop column google_maps_url;
        alter table pacientes drop column comparte_ubicacion;
    end if;
end $$;
```

**Por que es idempotente**: la segunda corrida encuentra que
`pacientes.google_maps_url` ya no existe (el `if exists` del bloque `do`
da falso) y no hace nada -- igual que la migracion `019`. El `create
table`/`create index`/`create trigger` ya son idempotentes por si solos
(`if not exists` / `drop ... if exists` + recrear).

**Plan de aplicacion (siguiendo la disciplina del proyecto)**:
1. Probar en Docker desechable: instalacion limpia (`schema.sql`
   actualizado) + aplicar la migracion sobre una copia del schema viejo
   con datos sinteticos (pacientes con y sin direccion) + re-correrla
   una segunda vez para confirmar idempotencia, sin duplicar filas ni
   fallar el indice unico parcial.
2. Aplicar a **`.17` unicamente** (asi lo pediste) -- Neon queda
   pendiente para cuando decidas subir esto a produccion, con su propia
   confirmacion aparte como siempre.
3. **Aviso importante, mismo caso que la migracion 019**: en cuanto se
   apliquen los `drop column` sobre `.17`, el backend que sigue corriendo
   (`pacientes.controller.js`, que hoy hace insert/update directo de
   `direccion`/`google_maps_url`/`comparte_ubicacion` en `pacientes`) va
   a fallar con error de SQL en cualquier alta/edicion de paciente, hasta
   que se actualice el controller para usar la tabla nueva. Antes de
   aplicar el `drop column` te voy a preguntar si prefieres aplicar
   migracion + backend juntos en la misma sesion (recomendado, como se
   hizo con doctor_especialidades) o dejar `.17` con el backend roto
   hasta una sesion aparte.

`schema.sql` tambien se actualiza en el mismo cambio: se agrega la tabla
`direcciones_paciente` (para instalaciones nuevas) y se quitan las 3
columnas de `pacientes`, para que quede consistente con el resultado
final de la migracion.

---

## 6. Cambios de codigo (backend + frontend) -- fuera del alcance de esta migracion

Pendientes para cuando se autorice la Fase 2 (no se tocan en el plan de
migracion de base de datos que pediste ahora):

- **Backend**: nuevo `direccionesPaciente.controller.js` (CRUD:
  listar/crear/actualizar/eliminar direcciones de un paciente, mas una
  accion dedicada "marcar como principal" que desmarca la anterior y
  marca la nueva dentro de una transaccion). `pacientes.controller.js`
  deja de manejar `direccion`/`google_maps_url`/`comparte_ubicacion`
  directamente. Los lugares que hoy leen esos campos del paciente
  (listar/historial en `pacientes.controller.js`, mensajes de WhatsApp)
  pasan a hacer join contra `direcciones_paciente where es_principal`.
- **Frontend**: el formulario de Pacientes cambia de "una direccion" a
  una lista repetible (mismo patron FormArray ya usado para
  especialidades de doctor / medicamentos de receta): agregar/quitar
  direccion, boton "Marcar como principal" por fila, y el boton
  "Detectar provincia y distrito" (seccion 4 original, ahora aplicado
  por fila en vez de una sola vez). Los iconos de "Ver en el mapa"/
  "Waze"/WhatsApp al doctor (listado de Pacientes, historial) pasan a
  usar la direccion principal en vez de `paciente.google_maps_url`
  directo.

---

## 7. Fases de implementacion propuestas

1. ✅ **Fase 0 -- validacion empirica**: script Node suelto contra la API
   real con la key ya restringida, confirmado el mapeo (seccion 3).
2. **Fase 1 -- migracion de base de datos** (`.17`, seccion 5): tabla
   `direcciones_paciente`, backfill, eliminacion de las 3 columnas viejas
   de `pacientes`. Es la fase que se va a ejecutar ahora, a continuacion.
3. **Fase 2 -- backend**: variable de entorno `MAPKEY`, endpoint
   `/api/geocodificacion/reverse`, y el nuevo
   `direccionesPaciente.controller.js` con su CRUD + "marcar como
   principal" (seccion 6). Se hacen juntas porque el backend queda roto
   apenas se aplique el `drop column` de la Fase 1 (ver aviso de la
   seccion 5) -- no tiene sentido separar el momento en que se aplican a
   `.17`, aunque el codigo se escriba y revise por separado.
4. **Fase 3 -- frontend**: formulario de Pacientes con lista repetible de
   direcciones, boton "Marcar como principal", boton "Detectar provincia
   y distrito" por direccion, e iconos de ubicacion (listado/historial)
   apuntando a la direccion principal.

Cada fase se prueba por separado antes de pasar a la siguiente, siguiendo
la misma disciplina que el resto del proyecto.

---

## 8. Fuera de alcance de esta primera version

- **Sucursales y Campañas**: mismo patron, extension directa (mismas 3
  columnas + mismo boton reusando `MapaSelectorComponent`) una vez que el
  endpoint backend ya exista -- no se implementa ahora por decision
  explicita del usuario.
- **Cache de resultados por coordenadas**: si el volumen de clics en
  "Detectar division politica" llegara a ser alto, se podria cachear en
  una tabla propia (`geocodificacion_cache`, clave = lat/lng redondeados a
  4 decimales) para no volver a pagar la misma consulta -- no hace falta
  para el volumen esperado de una clinica.
- **Autocompletado de direcciones (Places Autocomplete)**: la API de
  Google tambien ofrece sugerencias de direccion mientras se escribe
  (distinto de Geocoding) -- no forma parte de este diseno, que es
  puntual a "coordenadas -> division politica".

---

## Notas de seguridad (resumen)

- La API key de Google **nunca** se pone en codigo de Angular ni se sube
  a git -- solo vive en `backend/.env` (ya en `.gitignore`).
- Restringida en Google Cloud Console a **Geocoding API unicamente**
  (confirmado por el usuario, 2026-09-08).
- Activar una alerta de presupuesto en Google Cloud Billing como
  salvaguarda adicional (pendiente, responsabilidad del usuario, no
  automatizable desde este proyecto).
