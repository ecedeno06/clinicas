// Misma logica que condicionAccesoHistorial() en pacientes.controller.js
// (consentimiento cross-clinica, migracion 055), pero para endpoints que
// solo reciben un cita_id (recetas/laboratorio/signos-vitales POR CITA,
// llamados desde el tab "Historial" de Pacientes y desde Citas) -- el
// paciente_id/empresa_id DUENOS del registro se resuelven via el join a
// "citas" que cada uno de esos controllers ya hace, en vez de recibirlos
// aparte.
//
// aliasCitas: alias de la tabla citas ya unida en el FROM/JOIN (ej. 'c').
// empresaViewerPlaceholder: el placeholder ($1, $2, etc.) que ya trae la
// empresa de quien consulta (req.empresaId) en esa consulta puntual.
function condicionAccesoPorCita(aliasCitas, empresaViewerPlaceholder) {
  return `(
    ${aliasCitas}.empresa_id = ${empresaViewerPlaceholder}
    or (
      exists(
        select 1 from pacientes_empresas pe_origen
        where pe_origen.paciente_id = ${aliasCitas}.paciente_id
          and pe_origen.empresa_id = ${aliasCitas}.empresa_id
          and pe_origen.activo
          and pe_origen.comparte_historial_clinico = true
      )
      and exists(
        select 1 from pacientes_empresas pe_viewer
        where pe_viewer.paciente_id = ${aliasCitas}.paciente_id
          and pe_viewer.empresa_id = ${empresaViewerPlaceholder}
          and pe_viewer.activo
      )
    )
  )`;
}

module.exports = { condicionAccesoPorCita };
