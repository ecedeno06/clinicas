-- Distingue el PROPOSITO del token de consentimiento_datos_tokens:
-- 'solicitud' (default, comportamiento existente) es la solicitud
-- original de compartir -- el correo ofrece Aceptar (pide OTP) o
-- Rechazar (no pide OTP, accion de menor riesgo). 'revocacion' es el
-- nuevo flujo iniciado por el paciente ya autenticado desde su portal
-- ("Mis Clinicas") para DEJAR de compartir algo que ya estaba activo --
-- a diferencia de rechazar una solicitud nueva, aca siempre se exige el
-- OTP (ver responder() en consentimientoDatos.controller.js), porque
-- revertir un consentimiento ya otorgado es mas sensible que nunca
-- haberlo otorgado.

alter table consentimiento_datos_tokens add column if not exists accion text not null default 'solicitud' check (accion in ('solicitud', 'revocacion'));
