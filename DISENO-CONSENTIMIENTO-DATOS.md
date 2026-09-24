# Diseno: consentimiento del paciente para compartir su historial entre clinicas (Ley 81)

> Documenta el modelo de consentimiento cruzado entre clinicas del
> ecosistema, ajustado para cumplir con el principio de finalidad y
> consentimiento informado de la Ley 81 de Panama (proteccion de datos
> personales). Cubre las migraciones 055-057 (implementadas 2026-09-19/20)
> mas el ajuste a regla **bidireccional** hecho el 2026-09-24 -- este
> documento no existia antes de ese ajuste, se crea junto con el.
>
> **Estado: implementado y probado.** No hay trabajo pendiente de codigo
> en este diseno; la seccion 6 deja registrada una brecha operativa
> conocida, resuelta manualmente por ahora (no automatizada a proposito).

## 1. Principio central

Un dato clinico generado en la Clinica A es visible para la Clinica B **si
y solo si** el paciente dio consentimiento activo en **ambas** clinicas —
en A para que libere lo suyo, y en B para que ella misma participe del
intercambio. No hay herencia automatica por "pertenecer a la misma red", y
la revocacion en cualquiera de las dos rompe el cruce de inmediato.

Esto es deliberadamente mas estricto que "la red confia en si misma": cada
par de clinicas necesita su propio consentimiento explicito, y ese
consentimiento nunca es retroactivo ni se hereda cuando una clinica nueva
se suma a la red (ver seccion 6).

## 2. Modelo de datos

```
pacientes_empresas (relacion N:M paciente <-> clinica)
  comparte_historial_clinico boolean default false
  -- Consentimiento de ESTA clinica (empresa_id de esta fila) para:
  --  a) liberar el historial que ELLA genero hacia otras clinicas, y
  --  b) recibir/consultar lo que OTRAS clinicas hayan liberado
  --     (ver seccion 3 -- el mismo booleano cubre ambos sentidos).

consentimiento_datos_tokens (solicitud/respuesta, con OTP)
  paciente_id, empresa_id, token, otp
  respuesta   'pendiente' | 'aceptado' | 'rechazado'
  accion      'solicitud' | 'revocacion'   -- migracion 057
  expira_en, respondido_en
```

Es un solo booleano por (paciente, clinica) -- no hay una tabla separada
para "consentimiento de recibir" vs "consentimiento de compartir". La
seccion 3 explica por que eso es intencional y la seccion 7 el ajuste de
texto legal que ese diseno exige.

`paciente_antecedente` (antecedentes patologicos) **no** pasa por este
mecanismo -- no tiene `empresa_id`, se comparte siempre entre todas las
clinicas donde el paciente tiene una relacion activa, sin condicion.

## 3. Regla de acceso (bidireccional)

Implementada en dos funciones gemelas, una por cada forma en que los
controllers necesitan resolver quien es el dueño del dato:

- `condicionAccesoHistorial(alias)` — `backend/src/controllers/pacientes.controller.js`.
  Para los 4 endpoints que reciben `paciente_id` directo (`historial`,
  `signosVitalesHistorial`, `laboratorioHistorial`, `recetasHistorial`).
- `condicionAccesoPorCita(aliasCitas, empresaViewerPlaceholder)` —
  `backend/src/utils/accesoCitaCrossClinica.js`. Para endpoints que solo
  reciben un `cita_id` (recetas/laboratorio/signos-vitales por cita,
  usados desde el detalle de una consulta).

Ambas expresan la misma condicion SQL:

```sql
(
  <dato>.empresa_id = <empresa_del_viewer>
  or (
    <cita>.estado = 'atendida'  -- solo lo cruzado se filtra a esto
    and exists(  -- la clinica DUEÑA del dato dio su consentimiento
      select 1 from pacientes_empresas pe_origen
      where pe_origen.paciente_id = <paciente>
        and pe_origen.empresa_id = <dato>.empresa_id
        and pe_origen.activo
        and pe_origen.comparte_historial_clinico = true
    )
    and exists(  -- la clinica que CONSULTA tambien dio el suyo
      select 1 from pacientes_empresas pe_viewer
      where pe_viewer.paciente_id = <paciente>
        and pe_viewer.empresa_id = <empresa_del_viewer>
        and pe_viewer.activo
        and pe_viewer.comparte_historial_clinico = true
    )
  )
)
```

**Antes del ajuste del 2026-09-24**, `pe_viewer` solo exigia `activo`, sin
el `comparte_historial_clinico = true` propio -- cualquier clinica con una
relacion activa con el paciente veia lo compartido por otra, sin haber
pedido ni otorgado su propio consentimiento. Eso era una fuga
unidireccional, no un cruce autorizado por ambas partes; se corrigio
agregando esa misma condicion al lado del viewer en las dos funciones.

**El mismo dia se agrego ademas el filtro `estado = 'atendida'`** al lado
cruzado (no al lado propio): una cita pendiente, cancelada o "no_asistio"
de la otra clinica no aporta continuidad de atencion -- el fin declarado
del consentimiento -- y expone informacion sin valor clinico real (ej. una
cita futura agendada, que ni siquiera paso todavia). La propia clinica
sigue viendo TODOS los estados de sus propias citas; el filtro es
exclusivo de lo compartido.

Probado con Postgres real (dos empresas reales, un paciente vinculado a
ambas): A comparte + B no comparte -> sin acceso; A comparte + B tambien
comparte -> con acceso; revocar en cualquiera de las dos corta el cruce de
inmediato; la propia clinica dueña siempre ve sus datos sin condicion; una
cita pendiente de A no aparece en el cruce hacia B aunque ambas compartan,
pero A si la ve en su propio historial.

## 4. Flujo de solicitud (otorgar consentimiento)

Dos formas de iniciarlo, mismo resultado:

- **Staff-iniciado**: `pacientes.controller.js#solicitarConsentimientoDatos`
  (boton de accion en Pacientes).
- **Autoservicio del paciente**: `portalPaciente.controller.js#solicitarConsentimiento`
  (pantalla "Mis Clinicas" del portal).

Ambos llaman a `enviarSolicitudConsentimiento()` en
`backend/src/utils/solicitudConsentimiento.js`, que genera un token +
OTP de 6 digitos, los guarda en `consentimiento_datos_tokens`, y manda un
correo con el disclaimer legal completo (ver seccion 7) y dos botones:

- **Aceptar**: exige escribir el OTP en la pagina publica
  `/consentimiento-datos?token=...`. Al confirmar, actualiza
  `pacientes_empresas.comparte_historial_clinico = true` para esa
  (paciente, clinica) puntual.
- **Rechazar**: no exige OTP (accion de menor riesgo).

Al responder (acepte o rechace), se notifica a los super-admin (que
optaron por recibir estos correos, `usuarios.acepta_correo_super_admin`,
migracion 056) y a la clinica solicitante, con copia al paciente.

## 5. Flujo de revocacion (retirar consentimiento)

Tres caminos, dos de ellos ya construidos antes de este ajuste:

1. **Staff revoca sin OTP**: `pacientes.controller.js#rechazarConsentimientoDatos`
   apaga el flag de inmediato y le manda al paciente una carta formal
   explicando la revocacion y como volver a solicitarlo.
2. **Paciente revoca desde su portal, con OTP**: `portalPaciente.controller.js#solicitarRevocacion`
   dispara un token con `accion = 'revocacion'` (migracion 057) -- a
   diferencia de rechazar una solicitud nueva, revocar algo ya activo
   **siempre** exige el OTP, y ese correo lleva copia a super-admins y a
   la clinica (para que quede registro de que el paciente inicio el
   tramite, responda o no despues).
3. Ambos caminos terminan en el mismo `UPDATE ... set comparte_historial_clinico = false`,
   scopeado a (paciente_id, empresa_id) -- revocar es tan granular como
   otorgar: se hace clinica por clinica, nunca "para toda la red" de una
   sola vez.

Con la regla bidireccional (seccion 3), revocar en **cualquiera** de las
dos puntas de un cruce lo rompe de inmediato -- no hace falta que ambas
clinicas revoquen para cortar el acceso.

## 6. Brecha operativa conocida (sin automatizar, a proposito)

Cuando una clinica nueva se une a la red y un paciente que **ya** comparte
en la Clinica A pasa a tener tambien una relacion activa con la Clinica B,
nada le avisa al staff de B que existe informacion de ese paciente en A
disponible para solicitar. La unica forma de detectarlo hoy es correr una
consulta de auditoria a mano:

```sql
select pe_origen.empresa_id as clinica_duena, pe_viewer.empresa_id as clinica_consulta,
       count(distinct pe_origen.paciente_id) as pacientes_afectados
from pacientes_empresas pe_origen
join pacientes_empresas pe_viewer
  on pe_viewer.paciente_id = pe_origen.paciente_id
  and pe_viewer.empresa_id <> pe_origen.empresa_id
  and pe_viewer.activo
where pe_origen.activo
  and pe_origen.comparte_historial_clinico = true
  and pe_viewer.comparte_historial_clinico = false
group by pe_origen.empresa_id, pe_viewer.empresa_id;
```

Corrida contra produccion el 2026-09-24: **1 par de clinicas, 2 pacientes
afectados** ("DE Medical Clinic" -> "Clinica Jimenez"). Decision explicita
del usuario: **no** construir un mecanismo automatico de deteccion/aviso
por ahora -- se resuelve manualmente (avisarle a la clinica que puede
solicitar el consentimiento desde Pacientes, funcion que ya existe). Si
esto se repite a mayor escala mas adelante (mas clinicas uniendose a la
red), conviene reconsiderar un indicador visible para el staff en vez de
depender de correr esta consulta a mano.

## 7. Texto legal (donde vive, que dice)

Vive en `backend/src/utils/solicitudConsentimiento.js` (texto plano y
HTML del correo de solicitud) -- unica fuente, no esta duplicado en el
frontend. Cubre, en orden:

1. Declaracion de que se comparte informacion clinica (diagnosticos,
   tratamientos, laboratorio, etc.) entre la clinica y las demas de la red.
2. **Doble efecto del consentimiento** (parrafo agregado en el ajuste del
   2026-09-24): que aceptar en esta clinica habilita tanto que ella
   *comparta* hacia la red como que *reciba* lo compartido por otras --
   en ambos casos, solo respecto de clinicas donde el paciente tambien
   dio el mismo consentimiento. Este parrafo se agrego porque, antes de
   la regla bidireccional (seccion 3), un solo booleano por clinica no
   necesitaba explicar dos efectos distintos; con la regla nueva, sí lo
   necesita para seguir siendo un consentimiento genuinamente informado.
3. Derecho a revocar en cualquier momento, sin justificar, y que no
   afecta el tratamiento ya realizado.
4. Que la propia clinica puede rechazar el uso de su informacion
   compartida por cuenta propia, en cualquier momento.

El correo de revocacion (`enviarSolicitudRevocacion`, mismo archivo) no
repite el disclaimer completo -- solo confirma la accion puntual de dejar
de compartir, con el mismo OTP.

## 8. Migraciones relacionadas

| # | Que agrega |
|---|---|
| `055_consentimiento_datos.sql` | `pacientes_empresas.comparte_historial_clinico` + tabla `consentimiento_datos_tokens` |
| `056_acepta_correo_super_admin.sql` | `usuarios.acepta_correo_super_admin` (opt-out de notificaciones) |
| `057_consentimiento_datos_accion.sql` | `consentimiento_datos_tokens.accion` ('solicitud' / 'revocacion') |

El ajuste a regla bidireccional (seccion 3) y el parrafo legal (seccion 7)
**no requirieron migracion nueva** -- son cambios de logica de acceso y de
texto de correo unicamente, sobre columnas que ya existian.
