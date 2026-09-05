import { Component, ElementRef, EventEmitter, OnDestroy, Output, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { createWorker } from 'tesseract.js';

export interface DatosDocumentoDetectados {
  identificacion: string;
  nombre: string;
  fecha_nacimiento: string;
  sexo: string;
}

const MESES_ES: Record<string, string> = {
  ENE: '01', FEB: '02', MAR: '03', ABR: '04', MAY: '05', JUN: '06',
  JUL: '07', AGO: '08', SEP: '09', SET: '09', OCT: '10', NOV: '11', DIC: '12',
};

// Lineas que casi seguro son encabezados/etiquetas del documento, no el
// nombre de la persona -- se descartan al buscar la linea de nombre.
const PALABRAS_EXCLUIDAS_NOMBRE = [
  'REPUBLICA', 'PANAMA', 'CEDULA', 'IDENTIDAD', 'PERSONAL', 'TRIBUNAL',
  'ELECTORAL', 'NACIMIENTO', 'FECHA', 'SEXO', 'PASAPORTE', 'PASSPORT',
  'NACIONALIDAD', 'LUGAR', 'PROVINCIA', 'VENCE', 'EMISION', 'AUTORIDAD',
];

// Heuristicas de texto libre sobre el resultado del OCR -- ninguna cedula
// o pasaporte trae los campos etiquetados de forma estandar, asi que esto
// es "mejor esfuerzo": siempre se muestra editable antes de aplicarse,
// nunca se guarda directo sobre el formulario sin que el usuario confirme.
function extraerCampos(textoCrudo: string): DatosDocumentoDetectados {
  const texto = textoCrudo.toUpperCase();
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);

  let identificacion = '';
  const matchCedula = texto.match(/\b\d{1,2}-\d{3,4}-\d{3,6}\b/);
  if (matchCedula) {
    identificacion = matchCedula[0];
  } else {
    const matchPasaporte = texto.match(/PASAPORTE[^A-Z0-9]{0,10}([A-Z0-9]{6,12})/) || texto.match(/PASSPORT[^A-Z0-9]{0,10}([A-Z0-9]{6,12})/);
    if (matchPasaporte) identificacion = matchPasaporte[1];
  }

  let fecha_nacimiento = '';
  const matchFechaTexto = texto.match(/NACIMIENTO[^0-9]{0,10}(\d{1,2})[-\/](\w{3,4})[-\/](\d{4})/);
  if (matchFechaTexto) {
    const mes = MESES_ES[matchFechaTexto[2].substring(0, 3)];
    if (mes) fecha_nacimiento = `${matchFechaTexto[3]}-${mes}-${matchFechaTexto[1].padStart(2, '0')}`;
  }
  if (!fecha_nacimiento) {
    const matchFechaNum = texto.match(/NACIMIENTO[^0-9]{0,10}(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
    if (matchFechaNum) {
      fecha_nacimiento = `${matchFechaNum[3]}-${matchFechaNum[2].padStart(2, '0')}-${matchFechaNum[1].padStart(2, '0')}`;
    }
  }

  let sexo = '';
  const matchSexo = texto.match(/SEXO[^A-Z]{0,5}([MF])\b/) || texto.match(/\b(MASCULINO|FEMENINO)\b/);
  if (matchSexo) sexo = matchSexo[1].startsWith('M') ? 'M' : 'F';

  let nombre = '';
  for (const linea of lineas) {
    const soloLetras = linea.replace(/[^A-ZÑÁÉÍÓÚ ]/g, '').trim();
    if (soloLetras.length < 6 || soloLetras.length !== linea.length) continue;
    if (PALABRAS_EXCLUIDAS_NOMBRE.some((p) => linea.includes(p))) continue;
    if (soloLetras.split(/\s+/).filter(Boolean).length < 2) continue;
    nombre = soloLetras.toLowerCase().split(' ').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    break;
  }

  return { identificacion, nombre, fecha_nacimiento, sexo };
}

// Boton "Escanear documento": abre un selector con las mismas 3 formas de
// conseguir una imagen que app-selector-foto (camara, archivo, pegar), le
// corre OCR (Tesseract.js, en el navegador) y propone identificacion/
// nombre/fecha de nacimiento/sexo detectados -- siempre editables antes
// de aplicarlos, nunca se sobreescribe el formulario sin confirmar. El
// texto crudo tambien queda visible por si el parseo no encontro algo.
@Component({
  selector: 'app-escaner-documento',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './escaner-documento.component.html',
  styleUrl: './escaner-documento.component.css',
})
export class EscanerDocumentoComponent implements OnDestroy {
  @Output() datosDetectados = new EventEmitter<DatosDocumentoDetectados>();

  mostrarModal = signal(false);
  capturandoCamara = signal(false);
  procesando = signal(false);
  imagenCapturada = signal<string | null>(null);
  textoDetectado = signal<string | null>(null);
  errorOcr = signal<string | null>(null);
  copiado = signal(false);

  campoIdentificacion = signal('');
  campoNombre = signal('');
  campoFechaNacimiento = signal('');
  campoSexo = signal('');

  private camaraStream: MediaStream | null = null;

  @ViewChild('videoDoc') videoDocRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('fileInputDoc') fileInputDocRef?: ElementRef<HTMLInputElement>;

  abrir(): void {
    this.mostrarModal.set(true);
    this.capturandoCamara.set(false);
    this.imagenCapturada.set(null);
    this.textoDetectado.set(null);
    this.errorOcr.set(null);
    this.copiado.set(false);
  }

  cerrar(): void {
    this.detenerCamara();
    this.mostrarModal.set(false);
  }

  escanearOtro(): void {
    this.imagenCapturada.set(null);
    this.textoDetectado.set(null);
    this.errorOcr.set(null);
    this.copiado.set(false);
  }

  usarEstosDatos(): void {
    this.datosDetectados.emit({
      identificacion: this.campoIdentificacion().trim(),
      nombre: this.campoNombre().trim(),
      fecha_nacimiento: this.campoFechaNacimiento().trim(),
      sexo: this.campoSexo().trim(),
    });
    this.cerrar();
  }

  elegirArchivo(): void {
    this.fileInputDocRef?.nativeElement.click();
  }

  onArchivoSeleccionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) return;
    if (!archivo.type.startsWith('image/')) { alert('Selecciona un archivo de imagen valido.'); return; }
    const lector = new FileReader();
    lector.onload = () => this.procesarImagen(lector.result as string);
    lector.readAsDataURL(archivo);
  }

  async iniciarCamara(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      this.camaraStream = stream;
      this.capturandoCamara.set(true);
      setTimeout(() => {
        if (this.videoDocRef) this.videoDocRef.nativeElement.srcObject = stream;
      });
    } catch {
      alert('No se pudo acceder a la camara. Revisa los permisos del navegador.');
    }
  }

  capturarFoto(): void {
    const video = this.videoDocRef?.nativeElement;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/jpeg', 0.92);
    this.detenerCamara();
    this.procesarImagen(base64);
  }

  detenerCamara(): void {
    this.camaraStream?.getTracks().forEach((t) => t.stop());
    this.camaraStream = null;
    this.capturandoCamara.set(false);
  }

  onPasteDoc(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const archivo = items[i].getAsFile();
        if (archivo) {
          const lector = new FileReader();
          lector.onload = () => this.procesarImagen(lector.result as string);
          lector.readAsDataURL(archivo);
        }
        return;
      }
    }
    alert('No se encontro ninguna imagen en el portapapeles.');
  }

  copiarTexto(): void {
    const texto = this.textoDetectado();
    if (!texto) return;
    navigator.clipboard.writeText(texto).then(() => {
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    });
  }

  ngOnDestroy(): void {
    this.detenerCamara();
  }

  private async procesarImagen(base64: string): Promise<void> {
    this.imagenCapturada.set(base64);
    this.procesando.set(true);
    this.errorOcr.set(null);
    try {
      const worker = await createWorker('spa');
      const { data } = await worker.recognize(base64);
      await worker.terminate();
      this.textoDetectado.set(data.text.trim() || '(No se detecto texto en la imagen)');
      const campos = extraerCampos(data.text);
      this.campoIdentificacion.set(campos.identificacion);
      this.campoNombre.set(campos.nombre);
      this.campoFechaNacimiento.set(campos.fecha_nacimiento);
      this.campoSexo.set(campos.sexo);
    } catch {
      this.errorOcr.set('No se pudo procesar la imagen. Intenta con una foto mas nitida.');
    } finally {
      this.procesando.set(false);
    }
  }
}
