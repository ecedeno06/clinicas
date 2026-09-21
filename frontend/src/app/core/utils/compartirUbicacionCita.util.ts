import { Cita } from '../models/models';
import { formatoAmPm } from './hora12.util';
import { extraerLatLng } from '../components/mapa-selector/mapa-selector.component';

function formatearFechaCorta(iso: string | null | undefined): string {
  if (!iso) return '';
  const [anio, mes, dia] = iso.substring(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

// Solo tiene sentido ofrecer "compartir ubicacion" si hay a donde
// mandarlo (telefono del paciente, marcado explicitamente como que
// recibe WhatsApp) y que mandar (enlace de la sucursal) -- mismo
// criterio usado en citas.component.ts y dashboard.component.ts.
export function puedeCompartirUbicacionCita(c: Cita): boolean {
  return !!c.paciente_telefono && !!c.paciente_acepta_whatsapp && !!c.sucursal_google_maps_url;
}

// wa.me abre WhatsApp Web/app con el mensaje precargado para ese numero
// -- no requiere API ni cuenta de WhatsApp Business.
export function whatsappUrlUbicacionCita(c: Cita, empresaNombre?: string | null): string {
  const telefono = (c.paciente_telefono || '').replace(/\D/g, '');

  const lineas = [
    `Hola ${c.paciente_nombre}, te confirmamos los datos de tu cita${empresaNombre ? ` en ${empresaNombre}` : ''}:`,
    '',
    `Fecha: ${formatearFechaCorta(c.fecha)}`,
    `Hora: ${formatoAmPm(c.hora_inicio)}`,
    `Doctor: ${c.doctor_nombre}${c.especialidad_nombre ? ` (${c.especialidad_nombre})` : ''}`,
    `Sucursal: ${c.sucursal_nombre}`,
  ];
  if (c.sucursal_direccion) lineas.push(c.sucursal_direccion);
  if (c.sucursal_hora_apertura && c.sucursal_hora_cierre) {
    lineas.push(`Horario de atencion de la sucursal: ${formatoAmPm(c.sucursal_hora_apertura)} - ${formatoAmPm(c.sucursal_hora_cierre)}`);
  }
  if (c.sucursal_telefono) {
    lineas.push(`Telefono: ${c.sucursal_telefono}${c.sucursal_acepta_whatsapp ? ' (WhatsApp)' : ''}`);
  }
  lineas.push('', `Ubicacion (Google Maps): ${c.sucursal_google_maps_url}`);

  // Waze es muy usado en la region junto a Google Maps -- si se puede
  // extraer lat/lng del enlace guardado, se ofrece tambien el link
  // directo para abrir la navegacion en Waze.
  const coords = extraerLatLng(c.sucursal_google_maps_url);
  if (coords) {
    lineas.push(`Abrir con Waze: https://waze.com/ul?ll=${coords[0]},${coords[1]}&navigate=yes`);
  }

  return `https://wa.me/${telefono}?text=${encodeURIComponent(lineas.join('\n'))}`;
}
