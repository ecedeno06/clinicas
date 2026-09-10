import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { superAdminGuard } from './core/guards/super-admin.guard';
import { LayoutComponent } from './features/layout/layout.component';
import { LoginComponent } from './features/login/login.component';
import { RestablecerPasswordComponent } from './features/restablecer-password/restablecer-password.component';
import { Recuperar2faComponent } from './features/recuperar-2fa/recuperar-2fa.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { PacientesComponent } from './features/pacientes/pacientes.component';
import { DoctoresComponent } from './features/doctores/doctores.component';
import { EspecialidadesComponent } from './features/especialidades/especialidades.component';
import { CitasComponent } from './features/citas/citas.component';
import { UsuariosComponent } from './features/usuarios/usuarios.component';
import { EmpresasComponent } from './features/empresas/empresas.component';
import { SucursalesComponent } from './features/sucursales/sucursales.component';
import { CampanasComponent } from './features/campanas/campanas.component';
import { ReporteCampanasComponent } from './features/reportes/reporte-campanas/reporte-campanas.component';
import { ReporteCitasComponent } from './features/reportes/reporte-citas/reporte-citas.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'restablecer-password', component: RestablecerPasswordComponent },
  { path: 'recuperar-2fa', component: Recuperar2faComponent },
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
      { path: 'sucursales', component: SucursalesComponent },
      { path: 'campanas', component: CampanasComponent },
      { path: 'reportes/campanas', component: ReporteCampanasComponent },
      { path: 'reportes/citas', component: ReporteCitasComponent },
      { path: 'empresas', component: EmpresasComponent, canActivate: [superAdminGuard] },
    ],
  },
  { path: '**', redirectTo: '' },
];
