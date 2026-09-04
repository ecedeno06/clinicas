import { Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { redimensionarImagen } from '../../utils/imagen.util';

// Boton de avatar (foto o iniciales) que al hacer clic abre un selector con
// 3 formas de conseguir una imagen: camara, archivo del equipo, o pegar
// (Ctrl+V). Solo entrega el resultado via (fotoCambiada) -- no llama a
// ningun servicio ni decide cuando se persiste; eso lo resuelve quien lo
// use (guardar de inmediato, o solo al enviar un formulario mas grande).
@Component({
  selector: 'app-selector-foto',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './selector-foto.component.html',
  styleUrl: './selector-foto.component.css',
})
export class SelectorFotoComponent implements OnDestroy {
  @Input() foto: string | null | undefined = null;
  @Input() nombre = '';
  @Input() titulo = 'Cambiar foto';
  // Cuando es true, solo se muestra la foto/iniciales: no se puede hacer
  // clic para cambiarla (ej. la ficha de la cita, donde la foto solo se
  // edita desde el registro del paciente).
  @Input() soloLectura = false;
  @Output() fotoCambiada = new EventEmitter<string>();

  mostrarSelector = signal(false);
  capturandoCamara = signal(false);
  private camaraStream: MediaStream | null = null;

  @ViewChild('videoFoto') videoFotoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('fileInputFoto') fileInputFotoRef?: ElementRef<HTMLInputElement>;

  iniciales(): string {
    return (this.nombre || '')
      .split(' ')
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('');
  }

  abrirSelector(): void {
    if (this.soloLectura) return;
    this.mostrarSelector.set(true);
    this.capturandoCamara.set(false);
  }

  cerrarSelector(): void {
    this.detenerCamara();
    this.mostrarSelector.set(false);
  }

  elegirArchivo(): void {
    this.fileInputFotoRef?.nativeElement.click();
  }

  onArchivoSeleccionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) return;
    if (!archivo.type.startsWith('image/')) { alert('Selecciona un archivo de imagen valido.'); return; }
    redimensionarImagen(archivo, 300).then((base64) => this.emitirFoto(base64));
  }

  async iniciarCamara(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      this.camaraStream = stream;
      this.capturandoCamara.set(true);
      setTimeout(() => {
        if (this.videoFotoRef) this.videoFotoRef.nativeElement.srcObject = stream;
      });
    } catch {
      alert('No se pudo acceder a la camara. Revisa los permisos del navegador.');
    }
  }

  capturarFoto(): void {
    const video = this.videoFotoRef?.nativeElement;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/jpeg', 0.85);
    this.detenerCamara();
    this.emitirFoto(base64);
  }

  detenerCamara(): void {
    this.camaraStream?.getTracks().forEach((t) => t.stop());
    this.camaraStream = null;
    this.capturandoCamara.set(false);
  }

  onPasteFoto(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const archivo = items[i].getAsFile();
        if (archivo) redimensionarImagen(archivo, 300).then((base64) => this.emitirFoto(base64));
        return;
      }
    }
    alert('No se encontro ninguna imagen en el portapapeles.');
  }

  ngOnDestroy(): void {
    this.detenerCamara();
  }

  private emitirFoto(base64: string): void {
    this.fotoCambiada.emit(base64);
    this.cerrarSelector();
  }
}
