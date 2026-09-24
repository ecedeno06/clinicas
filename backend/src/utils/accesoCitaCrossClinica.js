// Misma logica que condicionAccesoHistorial() en pacientes.controller.js
// (consentimiento cross-clinica, migracion 055), pero para endpoints que
// solo reciben un cita_id (recetas/laboratorio/signos-vitales POR CITA,
// llamados desde el tab "Historial" de Pacientes y desde Citas) -- el
// paciente_id/empresa_id DUENOS del registro se resuelven via el join a
// "citas" que cada uno de esos controllers ya hace, en vez de recibirlos
// aparte.
//
// Consentimiento BIDIRECCIONAL (ajustado para Ley 81): no alcanza con que
// la clinica DUENA del dato (pe_origen) lo libere -- la clinica que
// CONSULTA (pe_viewer) tambien debe tener su propio consentimiento activo
// otorgado. Sin este requisito, cualquier clinica con una relacion activa
// con el paciente podia ver lo compartido por otra sin haber pedido ni
// dado su propio consentimiento -- eso no es un cruce autorizado por
// ambas partes, es una fuga unidireccional. La revocacion en CUALQUIERA
// de las dos clinicas corta el cruce de inmediato (basta con que uno de
// los dos "exists" deje de cumplirse).
//
// Ademas, lo COMPARTIDO cruzado (no lo propio) se filtra a citas
// ATENDIDAS -- una cita pendiente/cancelada/no_asistio de la otra clinica
// no aporta continuidad de atencion (el fin declarado del consentimiento,
// ver DISENO-CONSENTIMIENTO-DATOS.md). La propia clinica sigue viendo
// todos los estados de sus propias citas, sin este filtro.
//
// aliasCitas: alias de la tabla citas ya unida en el FROM/JOIN (ej. 'c').
// empresaViewerPlaceholder: el placeholder ($1, $2, etc.) que ya trae la
// empresa de quien consulta (req.empresaId) en esa consulta puntual.
function condicionAccesoPorCita(aliasCitas, empresaViewerPlaceholder) {
  return `(
    ${aliasCitas}.empresa_id = ${empresaViewerPlaceholder}
    or (
      ${aliasCitas}.estado = 'atendida'
      and exists(
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
          and pe_viewer.comparte_historial_clinico = true
      )
    )
  )`;
}

module.exports = { condicionAccesoPorCita };
