import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { superAdminGuard } from './core/guards/super-admin.guard';
import { LayoutComponent } from './features/layout/layout.component';
import { LoginComponent } from './features/login/login.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { PacientesComponent } from './features/pacientes/pacientes.component';
import { DoctoresComponent } from './features/doctores/doctores.component';
import { EspecialidadesComponent } from './features/especialidades/especialidades.component';
import { CitasComponent } from './features/citas/citas.component';
import { UsuariosComponent } from './features/usuarios/usuarios.component';
import { EmpresasComponent } from './features/empresas/empresas.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'citas', component: CitasComponent },
      { path: 'pacientes', component: PacientesComponent },
      { path: 'doctores', component: DoctoresComponent },
      { path: 'especialidades', component: EspecialidadesComponent },
      { path: 'usuarios', component: UsuariosComponent },
      { path: 'empresas', component: EmpresasComponent, canActivate: [superAdminGuard] },
    ],
  },
  { path: '**', redirectTo: '' },
];
