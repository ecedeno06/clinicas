import { Component } from '@angular/core';
import { SessionService } from '../../services/session.service';

@Component({
  selector: 'app-inactividad',
  standalone: true,
  imports: [],
  templateUrl: './inactividad.component.html',
  styleUrl: './inactividad.component.css',
})
export class InactividadComponent {
  constructor(public sessionService: SessionService) {}
}
