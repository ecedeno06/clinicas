import pdfMake from 'pdfmake/build/pdfmake';
import vfsFonts from 'pdfmake/build/vfs_fonts';
import { TDocumentDefinitions } from 'pdfmake/interfaces';

let vfsRegistrado = false;

function asegurarFuentes(): void {
  if (vfsRegistrado) return;
  pdfMake.addVirtualFileSystem(vfsFonts);
  vfsRegistrado = true;
}

// Igual que el pipe `date:'dd/MM/yyyy':'UTC'` usado en pantalla: toma los
// componentes del string ISO tal cual, sin pasar por Date (que convertiria
// a la zona horaria local y podria correr la fecha un dia).
export function formatoFechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.substring(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

// Abre el PDF en una pestana nueva usando el visor nativo del navegador,
// donde el usuario decide si lo guarda o lo imprime. La pestana se abre de
// forma sincronica (antes de generar el PDF) para que el bloqueador de
// pop-ups del navegador no la intercepte.
export function generarPdf(docDefinition: TDocumentDefinitions): void {
  asegurarFuentes();
  const doc: TDocumentDefinitions = {
    ...docDefinition,
    footer: docDefinition.footer ?? ((currentPage: number, pageCount: number) => ({
      // El pie de pagina de pdfmake queda anclado al borde fisico inferior;
      // sin este margen superior el numero queda pegado al borde y muchas
      // impresoras lo recortan por caer fuera de su zona imprimible. Con
      // pageMargins bottom=30 (el que usan todos los reportes), 10pt de
      // margen superior lo centra dentro de esa franja.
      text: `${currentPage} / ${pageCount}`,
      alignment: 'right',
      margin: [0, 10, 30, 0] as [number, number, number, number],
      fontSize: 8,
      color: '##16181'
    })),
  };
  pdfMake.createPdf(doc).open();
}

export function encabezadoClinica(logo: string | null | undefined, nombreEmpresa: string | null | undefined, titulo: string): TDocumentDefinitions['content'] {
  const partes: any[] = [];
  if (logo) partes.push({ image: logo, width: 50, height: 50 });
  partes.push({
    stack: [
      ...(nombreEmpresa ? [{ text: nombreEmpresa, bold: true, fontSize: 12 }] : []),
      { text: titulo, fontSize: 16, bold: true, margin: [0, 2, 0, 0] },
    ],
    margin: [logo ? 10 : 0, 0, 0, 0],
  });
  return [{ columns: partes, margin: [0, 0, 0, 12] }] as any;
}
