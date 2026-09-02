import { Injectable, effect, signal } from '@angular/core';

export type Tema = 'light' | 'dark';

const STORAGE_KEY = 'clinica_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  tema = signal<Tema>(this.leerTemaInicial());

  constructor() {
    // El script inline en index.html ya aplica el tema inicial al <html>
    // antes de que Angular arranque (evita el parpadeo); este effect solo
    // se encarga de mantenerlo sincronizado cuando cambia despues.
    effect(() => {
      const tema = this.tema();
      document.documentElement.setAttribute('data-theme', tema);
      localStorage.setItem(STORAGE_KEY, tema);
    });
  }

  toggle(): void {
    this.tema.set(this.tema() === 'dark' ? 'light' : 'dark');
  }

  private leerTemaInicial(): Tema {
    const guardado = localStorage.getItem(STORAGE_KEY);
    if (guardado === 'light' || guardado === 'dark') return guardado;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
