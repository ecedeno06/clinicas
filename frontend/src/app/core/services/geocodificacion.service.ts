import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DivisionPolitica {
  pais: string | null;
  provincia: string | null;
  distrito: string | null;
  corregimiento: string | null;
}

// A diferencia de MapaSelectorComponent (que le pega directo a Nominatim/
// Esri, terceros sin API key), esto es nuestro propio backend -- si usa
// HttpClient normal, para heredar el interceptor de auth.
@Injectable({ providedIn: 'root' })
export class GeocodificacionService {
  private base = `${environment.apiUrl}/geocodificacion`;
  constructor(private http: HttpClient) {}

  reverse(lat: number, lng: number): Observable<DivisionPolitica> {
    return this.http.get<DivisionPolitica>(`${this.base}/reverse`, { params: { lat, lng } });
  }
}
