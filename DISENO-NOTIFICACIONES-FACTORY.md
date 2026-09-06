# Diseño: Factory de Notificaciones (Email, SMS, Push)

> **Documento de Diseño — Estado: Propuesto, solo análisis (no implementado).**
> **Por qué ahora:** ya son tres los documentos de diseño de esta sesión que
> necesitan "avisarle a alguien" de algo (ver sección 7) y hoy el sistema no
> tiene **ningún** mecanismo de notificaciones — ni email, ni SMS, ni push, ni
> siquiera un panel de campanita in-app. Este documento resuelve esa pieza
> una sola vez, de forma reutilizable, en vez de que cada feature invente su
> propio envío de correos por separado.

---

## 1. Qué es una "factory" aquí y por qué encaja

El patrón *Factory* resuelve exactamente este problema: el código que **decide
que hay que notificar a alguien** (ej. "el resultado de laboratorio ya está
listo") no debería saber nada sobre *cómo* se manda un email, un SMS o un push
— solo debería pedir "notifícalo por el canal que corresponda" y recibir de
vuelta algo que sabe cómo hacerlo. La *factory* es la pieza que, dado un canal
(`'email'`, `'sms'`, `'push'`), devuelve el objeto correcto para enviarlo, sin
que el resto del código tenga que hacer `if/else` por canal en cada lugar
donde se necesite avisar algo.

```
                     ┌─────────────────────┐
llamador (feature) → │ NotificacionService │  "notifica a este usuario que X"
                     └──────────┬──────────┘
                                │  (busca contacto + preferencia de canal)
                                ▼
                     ┌─────────────────────┐
                     │ NotificadorFactory  │  .crear('email' | 'sms' | 'push')
                     └──────────┬──────────┘
                                ▼
              ┌─────────────┬───────────────┬─────────────┐
              │EmailNotific.│  SmsNotific.  │ PushNotific.│   (todos implementan
              │ (Resend)    │  (Twilio)     │ (Web Push)  │    la misma interfaz)
              └─────────────┴───────────────┴─────────────┘
```

## 2. Estado actual del sistema (para referencia)

Ningún mecanismo de notificaciones existe hoy. Puntualmente:

- `usuarios` (personal de la clínica) **no tiene columna `telefono`** — solo
  `email`. Hace falta agregarla antes de poder mandar SMS al personal.
- `pacientes` ya tiene `telefono` y `email` — listo para notificar pacientes
  sin cambios de esquema ahí.
- No hay ninguna variable de entorno ni SDK de correo/SMS/push instalado en
  `backend/`.
- Ya se identificó esta necesidad, sin resolverla, en tres documentos previos
  de esta sesión (ver sección 7 para el detalle de cada caso de uso):
  `DISENO-LABORATORIO-QR-EXTERNO.md` (avisar al doctor cuando un laboratorio
  externo sube resultados), `DISENO-CAMPANAS-MEDICAS.md` (avisar al creador
  de una campaña cuando se aprueba/rechaza), y `MEJORAS-PROPUESTAS.md`
  (recordatorios de citas).

## 3. Modelo de datos propuesto

```sql
-- Bitacora de cada notificacion enviada (o intentada). Sirve tanto para
-- debug/soporte como para que el usuario vea su propio historial si algun
-- dia se agrega un panel in-app.
create table notificaciones (
    id                uuid primary key default gen_random_uuid(),
    empresa_id        uuid references empresas(id),  -- null si es una notificacion de super-admin/sistema
    -- A quien va dirigida. Uno de los dos segun el destinatario sea
    -- personal (usuarios) o paciente (pacientes) -- nunca ambos.
    usuario_id        uuid references usuarios(id),
    paciente_id       uuid references pacientes(id),
    canal             text not null check (canal in ('email', 'sms', 'push')),
    plantilla         text not null,       -- nombre logico, ej. 'laboratorio_completado'
    destinatario      text not null,       -- email o telefono ya resuelto, para no depender de que el usuario no haya cambiado su contacto despues
    asunto            text,                -- aplica a email; null en sms/push
    cuerpo            text not null,
    estado            text not null default 'pendiente'
                      check (estado in ('pendiente', 'enviada', 'fallida')),
    error             text,
    intentos          smallint not null default 0,
    -- Referencia generica a que registro origino la notificacion (para
    -- poder filtrar "todas las notificaciones de esta orden de laboratorio"),
    -- sin una FK formal por cada tipo de origen posible.
    origen_tipo       text,                -- ej. 'orden_laboratorio', 'campana', 'cita'
    origen_id         uuid,
    created_at        timestamptz not null default now(),
    enviada_at        timestamptz,
    -- Distinto de "estado": estado trackea si el ENVIO por el canal
    -- (email/sms/push) funciono; leida_at trackea si el USUARIO ya vio la
    -- notificacion en el panel in-app (seccion 6.1). Null = no leida. Se
    -- incluye desde ya (aunque el panel in-app sea Fase 3) para no tener
    -- que hacer una segunda migracion despues -- ver seccion 6.1.
    leida_at          timestamptz
);

create index idx_notificaciones_usuario on notificaciones(usuario_id);
create index idx_notificaciones_paciente on notificaciones(paciente_id);
create index idx_notificaciones_origen on notificaciones(origen_tipo, origen_id);

-- Preferencia de canal por usuario (opcional para el MVP -- ver seccion 8).
create table preferencias_notificacion (
    usuario_id   uuid primary key references usuarios(id) on delete cascade,
    email        boolean not null default true,
    sms          boolean not null default false,
    push         boolean not null default false
);

-- Prerequisito: usuarios necesita telefono para poder mandarle SMS.
alter table usuarios add column if not exists telefono text;
```

## 4. La interfaz común y la factory (backend, Node/Express)

Ubicación sugerida: `backend/src/services/notificaciones/`.

```js
// backend/src/services/notificaciones/canales/emailNotificador.js
class EmailNotificador {
  async enviar({ destinatario, asunto, cuerpoTexto, cuerpoHtml }) {
    // usa el SDK del proveedor elegido (ver seccion 5) -- devuelve
    // { exito: boolean, error?: string }
  }
}
module.exports = EmailNotificador;

// backend/src/services/notificaciones/canales/smsNotificador.js
class SmsNotificador {
  async enviar({ destinatario, cuerpoTexto }) { /* ... */ }
}
module.exports = SmsNotificador;

// backend/src/services/notificaciones/canales/pushNotificador.js
class PushNotificador {
  async enviar({ destinatario, asunto, cuerpoTexto }) { /* ... */ }
}
module.exports = PushNotificador;

// backend/src/services/notificaciones/notificadorFactory.js
const EmailNotificador = require('./canales/emailNotificador');
const SmsNotificador = require('./canales/smsNotificador');
const PushNotificador = require('./canales/pushNotificador');

function crearNotificador(canal) {
  switch (canal) {
    case 'email': return new EmailNotificador();
    case 'sms':   return new SmsNotificador();
    case 'push':  return new PushNotificador();
    default: throw new Error(`Canal de notificacion no soportado: ${canal}`);
  }
}

module.exports = { crearNotificador };
```

Todas las clases de canal implementan el mismo método `enviar(...)` con la
misma forma de retorno (`{ exito, error? }`) — eso es lo que permite que el
`NotificacionService` (sección 5) no necesite saber cuál canal está usando.

## 5. El servicio de orquestación (lo que de verdad llaman las features)

Nada en el resto del sistema debería llamar a la factory directamente — cada
feature llama a un servicio de más alto nivel, que resuelve destinatario,
plantilla, canal preferido, y deja la bitácora:

```js
// backend/src/services/notificaciones/notificaciones.service.js
const { crearNotificador } = require('./notificadorFactory');
const plantillas = require('./plantillas');  // ver seccion 6

// datos: { usuarioId? , pacienteId?, plantilla, variables, origenTipo?, origenId? }
async function notificar(datos) {
  const contacto = await resolverContacto(datos);          // email/telefono + canal preferido
  const { asunto, cuerpoTexto, cuerpoHtml } = plantillas[datos.plantilla](datos.variables);

  const registro = await guardarNotificacionPendiente({ ...datos, contacto, asunto, cuerpoTexto });
  try {
    const notificador = crearNotificador(contacto.canal);
    const resultado = await notificador.enviar({ destinatario: contacto.destino, asunto, cuerpoTexto, cuerpoHtml });
    await marcarResultado(registro.id, resultado);
  } catch (err) {
    await marcarResultado(registro.id, { exito: false, error: err.message });
    // Nunca relanzar: una notificacion fallida no debe tumbar la operacion
    // de negocio que la origino (ver seccion 9).
  }
}

module.exports = { notificar };
```

Uso típico desde cualquier controller (ejemplo con el caso de laboratorio QR):

```js
// dentro de laboratorio.controller.js, al recibir el resultado externo
await notificacionesService.notificar({
  usuarioId: orden.doctor_usuario_id,
  plantilla: 'laboratorio_completado',
  variables: { pacienteNombre: orden.paciente_nombre, examen: orden.examenes },
  origenTipo: 'orden_laboratorio',
  origenId: orden.id,
});
```

## 6. Plantillas de mensaje

En vez de un motor de plantillas pesado (Handlebars, EJS, etc. — no hace
falta para el volumen y complejidad actuales), un registro simple de
funciones, una por caso de uso, que devuelven texto ya armado:

```js
// backend/src/services/notificaciones/plantillas.js
module.exports = {
  laboratorio_completado: ({ pacienteNombre, examen }) => ({
    asunto: 'Resultado de laboratorio listo',
    cuerpoTexto: `El resultado de ${examen} para ${pacienteNombre} ya esta disponible.`,
  }),
  campana_aprobada: ({ nombreCampana }) => ({
    asunto: 'Campaña aprobada',
    cuerpoTexto: `Tu campaña "${nombreCampana}" fue aprobada.`,
  }),
  campana_rechazada: ({ nombreCampana, motivo }) => ({
    asunto: 'Campaña rechazada',
    cuerpoTexto: `Tu campaña "${nombreCampana}" fue rechazada. Motivo: ${motivo}`,
  }),
  cita_recordatorio: ({ pacienteNombre, fecha, hora, doctorNombre }) => ({
    asunto: 'Recordatorio de cita',
    cuerpoTexto: `Hola ${pacienteNombre}, recuerda tu cita el ${fecha} a las ${hora} con ${doctorNombre}.`,
  }),
};
```

Cada plantilla nueva que necesite una feature futura se agrega aquí, sin
tocar la factory ni los canales.

## 6.1 Panel in-app de notificaciones: por qué es la opción más barata

Antes de invertir en SMS o push (que requieren cuenta con un proveedor
externo, costo por mensaje, y en el caso de push un Service Worker que hoy no
existe en el frontend), vale la pena considerar adelantar el **panel in-app**
(campanita) — no es solo más barato, prácticamente ya viene resuelto por la
Fase 1: la tabla `notificaciones` se llena sin importar qué canal externo
termine habilitado o no, así que el panel in-app solo necesita **leer** esa
misma tabla, no un canal de envío propio.

**Ejemplo de punta a punta, con el caso `laboratorio_completado`:**

1. Un laboratorio externo sube un resultado vía el enlace del QR (ver
   `DISENO-LABORATORIO-QR-EXTERNO.md`) → se inserta una fila en
   `notificaciones` (`usuario_id` = el doctor solicitante, `plantilla` =
   `laboratorio_completado`, `cuerpo` = *"El resultado de Hemograma para
   Edwin Cedeno ya está disponible."*, `origen_tipo` = `'orden_laboratorio'`,
   `origen_id` = el id de la orden).
2. En el header del layout (junto al botón de tema claro/oscuro y el avatar
   del usuario) aparece un ícono de campana con un badge — conteo de filas
   con `leida_at is null` para ese usuario.
3. Al hacer clic, se despliega un panel (mismo patrón visual que el
   `.dropdown-menu` ya usado para el menú del avatar) listando las
   notificaciones recientes: mensaje, hora relativa ("hace 5 min"), y un
   enlace **"Ir a la orden"** — reutilizando el mismo mecanismo de
   `queryParams` que ya usa la tarjeta "Laboratorios pendientes" del
   dashboard para llevar directo a la cita correspondiente.
4. Al abrir/hacer clic en una notificación, se marca `leida_at = now()` (`PUT
   /api/notificaciones/:id/leida`) y el badge baja de cuenta.

**Lo único nuevo que hace falta para esto** (además de lo ya descrito en la
Fase 1): la columna `leida_at` (sección 3, ya incluida), un endpoint
`GET /api/notificaciones` (listar las mías, paginado) y el
`PUT /api/notificaciones/:id/leida`, y el componente de frontend (campanita +
panel). No requiere ningún proveedor externo ni configuración adicional.

## 7. Casos de uso ya identificados (de otros documentos de esta sesión)

| Origen | Plantilla | Cuándo se dispara |
|---|---|---|
| `DISENO-LABORATORIO-QR-EXTERNO.md` §6 | `laboratorio_completado` | Un laboratorio externo sube resultados vía el enlace del QR |
| `DISENO-CAMPANAS-MEDICAS.md` §11 Fase 3 | `campana_aprobada` / `campana_rechazada` | Un admin aprueba o rechaza una campaña |
| `MEJORAS-PROPUESTAS.md` §5 | `cita_recordatorio` | Recordatorio programado antes de una cita (requiere un disparador por tiempo — ver sección 10, fuera de alcance de este documento) |

Este documento **no** vuelve a explicar esos flujos — solo asegura que los
tres puedan usar exactamente el mismo `notificaciones.service.js` en vez de
que cada uno resuelva el envío de correos por su cuenta.

## 8. Preferencia de canal y a quién notificar

Para el MVP (Fase 1, sección 11), no hace falta un panel de preferencias
completo — alcanza con una regla simple: **email por defecto para todos**, ya
que todo `usuario` y `paciente` ya tiene ese dato. La tabla
`preferencias_notificacion` (sección 3) queda lista desde el inicio, pero se
puede usar con una regla mínima (si no hay fila, se asume `email: true` y el
resto en `false`) hasta que se construya una pantalla para que cada quien
elija sus canales — eso es la Fase 5.

## 9. Resiliencia: las notificaciones nunca bloquean el negocio

Principio de diseño explícito: **una notificación fallida (proveedor caído,
correo inválido, etc.) nunca debe hacer fallar la operación que la originó.**
Ej.: si marcar una orden de laboratorio como `completada` dispara una
notificación y el proveedor de email está caído, la orden **igual** debe
quedar `completada` — el error de notificación se registra en `notificaciones`
(`estado='fallida'`, `error`) para poder revisarlo después, pero no se
propaga hacia arriba. Esto es consistente con cómo ya se maneja todo lo demás
en el sistema (errores de negocio sí bloquean, efectos secundarios
informativos no).

No se propone reintentos automáticos para el MVP (necesitaría una cola —
ver la nota ya existente en `MEJORAS-PROPUESTAS.md` §6 sobre no agregar
Redis/colas hasta que haga falta de verdad). Un reintento manual simple
("reenviar" desde una futura pantalla de notificaciones fallidas) es
suficiente hasta que el volumen lo justifique.

## 10. Proveedores recomendados por canal

| Canal | Proveedor recomendado | Alternativas | Nota |
|---|---|---|---|
| Email | **Resend** | SendGrid, Amazon SES | Igual que lo ya sugerido en `DISENO-LABORATORIO-QR-EXTERNO.md` §6 — API simple, buen nivel gratuito, dominio verificado una sola vez. |
| SMS | **Twilio** | Amazon SNS | Twilio soporta numeros de Panama; cobra por mensaje, revisar tarifa antes de habilitarlo para recordatorios masivos de citas. |
| Push | **Web Push** (API nativa del navegador + claves VAPID, sin servicio de terceros) | Firebase Cloud Messaging (si algún día existe app móvil) | Esta aplicación es web-only hoy — "push" realista es notificaciones del navegador, no push de app móvil. Requiere que el usuario acepte permisos de notificación y que el frontend registre un Service Worker, algo que hoy no existe en este proyecto Angular. |

Todos se configuran por variables de entorno (`RESEND_API_KEY`,
`TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`, claves VAPID), nunca hardcodeadas,
siguiendo el mismo patrón ya usado para `JWT_SECRET`/`DATABASE_URL`.

## 11. Hoja de ruta de implementación por fases

| Fase | Alcance | Depende de | Prioridad |
|---|---|---|---|
| **Fase 1** | Migración (`notificaciones` — incluyendo `leida_at` desde el inicio, ver sección 6.1 —, `preferencias_notificacion`, `usuarios.telefono`). Factory + interfaz común + `notificaciones.service.js`. Un solo canal real implementado: **email** (Resend). SMS y push quedan como clases con `enviar()` que lanzan "no implementado todavía" (para que la factory ya tenga la forma final sin bloquear el resto). | — | Media |
| **Fase 2** | Conectar el primer caso de uso real: `laboratorio_completado` (ver `DISENO-LABORATORIO-QR-EXTERNO.md`), que ya estaba diseñado esperando esta pieza. | Fase 1, y la Fase de laboratorio-QR que corresponda | Media |
| **Fase 3** | **Panel in-app de notificaciones** (campanita con badge, historial — ver sección 6.1). Adelantada respecto a SMS/push (decisión 2026-09-06): usa la misma tabla `notificaciones` ya poblada desde la Fase 1, no depende de ningún proveedor externo ni tiene costo por mensaje, así que da valor inmediato con el trabajo de frontend/endpoints de lectura nada más. | Fase 1 | Media |
| **Fase 4** | SMS real (Twilio) — habilitar como segundo canal externo, empezando por recordatorios de cita a pacientes (el caso de uso con mayor volumen esperado). | Fase 1 | Baja/Media |
| **Fase 5** | Pantalla de preferencias de notificación (usuario elige canales), y conectar `campana_aprobada`/`campana_rechazada`. | Fase 1, y `DISENO-CAMPANAS-MEDICAS.md` | Baja |
| **Fase 6** | Push (Web Push + Service Worker) — el canal más nuevo para el proyecto (requiere infraestructura de Service Worker que hoy no existe en el frontend). | Fase 1 | Baja |

## 12. Preguntas abiertas para decisión del usuario

1. **¿Ya existe una cuenta con algún proveedor** (Resend/SendGrid/Twilio/AWS),
   o hay que crear una desde cero? Afecta cuánto se puede avanzar en la
   Fase 1 sin bloquear en configuración externa.
2. **¿Se van a notificar pacientes directamente** (ej. recordatorios de
   cita), o por ahora las notificaciones son solo para el personal
   (doctor/admin)? Notificar pacientes por SMS tiene costo por mensaje y
   conviene decidirlo con cuidado antes de habilitarlo.
3. ~~¿Vale la pena adelantar el panel in-app de notificaciones antes que
   SMS/push?~~ **Resuelto (2026-09-06): sí.** La hoja de ruta (sección 11) ya
   quedó reordenada — el panel in-app pasó de Fase 6 a Fase 3, antes de SMS
   (Fase 4) y de push (Fase 6).
4. **¿Este documento también depende de otro en cola?** No depende de
   sucursales ni de campañas — puede construirse en paralelo o antes,
   incluso sin haber resuelto el orden ya decidido entre esos dos.

## 13. Fuera de alcance de este documento

- El disparador por tiempo para recordatorios de cita (ej. "avisar 24h
  antes") — eso requiere un mecanismo de tareas programadas (cron job o
  similar) que hoy no existe en el backend; este documento solo resuelve
  *cómo* se manda la notificación una vez que algo decide que hay que
  mandarla, no *cuándo* se dispara automáticamente por tiempo.
- Aplicación móvil / push nativo de app — no existe app móvil en este
  proyecto (ver sección 10).
- Plantillas de email con diseño HTML rico (logo, colores de marca) — el
  MVP asume texto plano/HTML mínimo; se puede enriquecer después sin
  cambiar la arquitectura.
