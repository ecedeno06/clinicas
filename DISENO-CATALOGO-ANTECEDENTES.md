# Diseno: catalogo de antecedentes medicos (reemplaza el texto libre de "Alergias")

> Informe de diseno. **No implementado todavia** — solo diseno e impacto,
> a la espera de decisiones sobre los puntos abiertos (seccion 6).
>
> Objetivo: en vez de un campo de texto libre (`pacientes.alergias`), el
> antecedente de un paciente se registra seleccionando de un **catalogo**
> (antecedente, desde, control), y ese catalogo puede crecer: cada clinica
> puede agregarle "tipos de antecedente" propios, pero nadie puede
> modificar ni borrar las entradas globales ni las creadas por otra
> clinica.

## 1. Modelo de datos

Dos tablas nuevas. Es un patron que **no existe todavia** en este sistema
(hasta ahora todo catalogo — `especialidades` — es 100% por-clinica, y
todo lo demas es 100% global — `usuarios`, `pacientes`). Aqui se necesita
un hibrido: filas globales + filas propias de cada clinica, conviviendo
en la misma tabla.

### 1.1 `catalogo_antecedentes` — los *tipos* de antecedente

Ajustado a tu boceto (`idAntecedente`, `nombreAntecedente`,
`descripcionAntecedente`, `idEmpresaOrigen`, `activo`), con los nombres
de columna en snake_case para que combinen con el resto del esquema:

```sql
create table catalogo_antecedentes (
    id            uuid primary key default gen_random_uuid(),
    nombre        text not null,
    descripcion   text,
    empresa_id    uuid references empresas(id) on delete cascade, -- NULL = catalogo global (tu "idEmpresaOrigen")
    activo        boolean not null default true,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

-- Evita duplicados dentro del mismo alcance (global, o cada clinica por separado)
create unique index uq_catalogo_antecedentes_nombre_alcance
    on catalogo_antecedentes (lower(nombre), coalesce(empresa_id, '00000000-0000-0000-0000-000000000000'));
```

- `empresa_id is null` → entrada **global** (visible y usable por toda la
  red, nadie de una clinica la puede editar/eliminar desde la UI normal).
- `empresa_id = <clinica>` → entrada creada por esa clinica (tu
  "idEmpresaOrigen").
- `descripcion`: igual que en tu boceto, texto libre opcional que
  explica el tipo de antecedente (aparte de `nombre`).
- Quite el campo `categoria` que habia propuesto en la version anterior
  de este documento, ya que tu boceto no lo tiene. **Impacto de esa
  simplificacion:** hoy el tab "Antecedentes" muestra un badge amarillo
  "!" especificamente cuando hay *alergias* registradas. Sin una
  categoria que distinga "esto es una alergia" de "esto es una cirugia
  antigua", ese badge tendria que volverse generico ("tiene antecedentes
  registrados", sin importar el tipo) — lo trato como resuelto en la
  seccion 6.1 mas abajo, pero confirmalo si te parece bien.
- No incluyo `creado_por` (quien de la clinica lo creo) porque tampoco
  esta en tu boceto — se puede agregar mas adelante sin romper nada si
  luego hace falta auditoria mas fina.
- `activo`: para "eliminar" una entrada sin romper los antecedentes de
  pacientes que ya la referencian (ver `on delete restrict` mas abajo,
  no se puede borrar fisicamente si esta en uso). Desactivar = deja de
  aparecer en el selector para nuevos registros, pero los ya existentes
  se siguen mostrando con su nombre.

### 1.2 `paciente_antecedentes` — los *registros* del paciente

```sql
create table paciente_antecedentes (
    id                       uuid primary key default gen_random_uuid(),
    paciente_id              uuid not null references pacientes(id) on delete cascade,
    catalogo_antecedente_id  uuid not null references catalogo_antecedentes(id) on delete restrict,
    desde                    date,
    control                  text,
    empresa_id               uuid not null references empresas(id), -- quien lo registro (auditoria)
    registrado_por           uuid references usuarios(id) on delete set null,
    activo                   boolean not null default true,
    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now()
);

create index idx_paciente_antecedentes_paciente on paciente_antecedentes(paciente_id);
```

Es la tabla equivalente a lo que hoy es el campo `pacientes.alergias`,
pero ahora es una lista (un paciente puede tener N antecedentes) en vez
de un unico texto, y cada fila apunta a una entrada del catalogo en vez
de contener texto libre.

## 2. Reglas de gobierno del catalogo (lo que pediste explicitamente)

| Quien | Puede crear | Puede editar/desactivar |
|---|---|---|
| Gestor de una clinica | Si — queda con `empresa_id` = su clinica | Solo las que tengan `empresa_id` = su clinica |
| Cualquier clinica, sobre una entrada **global** (`empresa_id is null`) | — | **No** |
| Cualquier clinica, sobre una entrada de **otra clinica** | — | **No** |
| Super admin (`usuarios.es_super_admin`) | Si, global o por-clinica | Si, cualquiera (incluyendo globales) |

En el backend esto se traduce a una sola validacion en
`PUT/DELETE /api/antecedentes/catalogo/:id`:

```js
if (!req.usuario.es_super_admin) {
  if (fila.empresa_id === null || fila.empresa_id !== req.empresaId) {
    return res.status(403).json({ mensaje: 'No puedes modificar este tipo de antecedente.' });
  }
}
```

**Punto de diseno importante que hay que decidir (seccion 6.2):** ¿el
catalogo de una clinica es visible (solo lectura) para las demas
clinicas al momento de *seleccionar* un antecedente, o cada clinica solo
ve el catalogo global + el suyo propio? Tu frase "no permita
borrar-modificar los... creados por otras clinicas" sugiere que si se
pueden **ver** (si no, no habria nada que proteger). Lo dejo como
recomendacion pero marcado como pregunta abierta porque cambia el
`WHERE` del listado y tiene implicancia de "una clinica ve terminologia
medica que agrego otra clinica" (en general inofensivo, ya que es solo
nombres de condiciones, no datos de pacientes).

## 3. ¿El registro del paciente es global o por-clinica?

Esto es la misma pregunta de arquitectura que ya resolvimos para
`alergias`: hoy ese campo vive en la tabla `pacientes` (global), por lo
que **todas** las clinicas de la red ven el mismo texto. Para mantener
ese mismo comportamiento con la nueva tabla, la recomendacion es:

- `paciente_antecedentes` se muestra **completo** a cualquier clinica
  vinculada al paciente (igual que hoy pasa con `alergias`), sin
  filtrar por `empresa_id`.
- `empresa_id` / `registrado_por` en cada fila son solo para
  **auditoria** ("¿quien registro esto?"), no para restringir quien lo
  ve.

Esto es coherente con el objetivo original del "paciente global" (que su
historial relevante se comparta en la red), pero es distinto de como
funcionan hoy `historias_clinicas`, `signos_vitales` y `recetas` (esas
si son estrictamente por-clinica, `escenario 3-6` del diseno de paciente
global sigue sin implementarse). Si prefieres que los antecedentes
**tambien** sean privados por clinica (cada una solo ve lo que ella
registro), es un cambio de una sola condicion en el `WHERE`, pero
significa que el historial medico del paciente queda fragmentado entre
clinicas — lo señalo en la seccion 6.3.

## 4. Impacto en backend

**Migracion nueva** `006_catalogo_antecedentes.sql`:
- Crea las 2 tablas + indices + trigger `set_updated_at` (mismo patron
  que las demas tablas).
- Migra los datos existentes: por cada paciente con `alergias` no vacio,
  inserta un `paciente_antecedente` contra una entrada de catalogo
  global sembrada especificamente para esto (p.ej. `"Antecedente
  migrado (ver notas)"`), con `control` = el texto original completo.
  Esto preserva el dato sin intentar
  auto-clasificarlo (una clasificacion automatica del texto libre no
  seria confiable) — despues cada clinica puede reclasificarlo a mano
  con mas detalle si quiere.
- **No borra** la columna `pacientes.alergias` todavia (se deprecia,
  no se elimina, hasta que el frontend deje de usarla — igual que
  hicimos con otros cambios, para poder revertir sin perder datos).

**Controladores nuevos:**
- `catalogoAntecedentes.controller.js` — `listar` (global + red o
  global + propio, segun 2.), `crear`, `actualizar`, `eliminar`
  (soft-delete, `activo=false`) con la regla de permisos de la seccion 2.
- `pacientes.controller.js` — se agregan `listarAntecedentes`,
  `crearAntecedente`, `actualizarAntecedente` (solo `desde`/`control`,
  no se reasigna el catalogo — si el gestor se equivoco de tipo, borra y
  crea de nuevo), `eliminarAntecedente` (soft-delete tambien, por
  trazabilidad medica).

**Rutas nuevas:**
- `GET/POST /api/antecedentes/catalogo`, `PUT/DELETE /api/antecedentes/catalogo/:id`
- `GET/POST /api/pacientes/:id/antecedentes`, `PUT/DELETE /api/pacientes/antecedentes/:antecedenteId`

## 5. Impacto en frontend

**Tab "Antecedentes" de Pacientes** deja de ser un `<textarea>` de
alergias y pasa a ser una lista editable:

```
Antecedentes                                    [+ Agregar antecedente]
─────────────────────────────────────────────────────────────────────
Diabetes tipo 2          Desde: 12/03/2020   Control: Medicado insulina   [Editar] [Eliminar]
Alergia a penicilina     Desde: -            Control: -                   [Editar] [Eliminar]
```

El boton "+ Agregar antecedente" abre un formulario chico con:
- **Antecedente**: combobox con busqueda sobre el catalogo (global + red
  o global + propio, ver 6.2). Si el texto buscado no existe, opcion
  inline "+ Crear '<texto>' como nuevo tipo" (queda con `empresa_id` de
  la clinica actual) — asi el gestor puede agregar tipos sin salir del
  flujo de registrar al paciente, tal como lo planteaste.
- **Desde**: input de fecha (opcional).
- **Control**: input de texto (opcional).

**Badge "!"** del tab pasa de basarse en `alergias` no vacio a basarse
en "tiene al menos un antecedente activo registrado" (sin distinguir si
es alergia, cirugia, etc., ya que el catalogo no tiene `categoria` —
ver 6.1). Si mas adelante quieres recuperar el badge especifico de
alergias, alcanza con agregar esa columna despues sin romper nada de lo
demas.

**Pantalla de administracion del catalogo** (nueva, opcional para fase 1
— ver seccion 7): una lista tipo Especialidades/Empresas, con columnas
Nombre / Descripcion / Origen ("Global" / "Tu clinica" / nombre de la
otra clinica de solo lectura), y acciones Editar/Eliminar habilitadas
solo en las filas de tu propia clinica.

**Archivos nuevos:** `catalogo-antecedentes.service.ts`,
interfaces `CatalogoAntecedente` / `PacienteAntecedente` en `models.ts`,
metodos nuevos en `pacientes.service.ts`.

## 6. Puntos abiertos (necesito tu decision antes de implementar)

### 6.1 `categoria` — resuelto: no se incluye
Segun tu boceto, el catalogo queda con `nombre` + `descripcion` + origen
+ `activo`, sin `categoria`. Consecuencia aceptada: el badge "!" del tab
se vuelve generico ("hay antecedentes"), ya no especifico de alergias.
Si en algun momento quieres el badge especifico otra vez, es agregar la
columna despues, sin migrar nada de lo existente.

### 6.2 ¿El catalogo es visible entre clinicas, o cada clinica ve solo lo global + lo suyo?
Tu descripcion sugiere que si (de lo contrario no habria nada que
proteger de "borrar/modificar lo de otra clinica"). Si prefieres que
cada clinica vea solo su propio catalogo + el global (mas simple, mas
"privado" entre clinicas competidoras que usan la misma plataforma),
dejo de necesitar el candado de permisos de la seccion 2 para terceros
(ya ni los verian), pero pierdes el beneficio de reutilizar tipos que
otra clinica ya creo (mas duplicados tipo "Diabetes" / "diabetes tipo 2"
/ "DM2").

### 6.3 ¿Los registros del paciente (`paciente_antecedentes`) son globales (recomendado, seccion 3) o por-clinica?
Si se hacen por-clinica, cada clinica solo veria los antecedentes que
ELLA registro para ese paciente, fragmentando su historial — igual que
hoy pasa con consultas/signos/recetas, pero **distinto** a como funciona
hoy `alergias`. Recomiendo mantenerlo global (igual que hoy), pero es tu
llamada.

### 6.4 ¿Quien puede poblar el catalogo global inicial?
Sugerido: un script de seed con antecedentes comunes (Diabetes tipo 1/2,
Hipertension, Asma, alergias a farmacos comunes, etc.) al aplicar la
migracion, mantenible despues solo por super-admin (no hay UI de
super-admin todavia en este sistema — se puede hacer por SQL directo
mientras no exista esa pantalla).

## 7. Alcance sugerido por fases

- **Fase 1** (la que habilita el flujo principal): tablas +
  migracion de datos + endpoints + el tab "Antecedentes" rehecho como
  lista, con creacion de tipos nuevos *inline* desde el mismo formulario
  (sin pantalla de administracion separada todavia).
- **Fase 2**: pantalla de administracion del catalogo (editar/desactivar
  tipos propios, ver el catalogo global y el de la red en solo lectura).
- **Fase 3** (opcional, futuro): deduplicar/fusionar tipos equivalentes
  creados por distintas clinicas con nombres parecidos; eliminar
  definitivamente `pacientes.alergias` una vez el frontend ya no la lea.

## 8. Riesgos

- **Migracion de datos**: los ~3 pacientes de prueba actuales con
  `alergias` en texto libre quedarian con un antecedente generico
  "migrado" — es informacion util pero menos estructurada que si se
  reclasificara a mano; no hay forma segura de automatizarlo mejor.
- **Duplicados de catalogo entre clinicas** si se opta por 6.2 = "cada
  clinica ve solo lo suyo": cada una terminara creando sus propias
  variantes de los mismos antecedentes comunes.
- **Alcance de UI**: el formulario de "agregar antecedente" con
  combobox + creacion inline es mas trabajo de frontend que un
  `<textarea>`; es la parte de mayor esfuerzo de esta propuesta.
