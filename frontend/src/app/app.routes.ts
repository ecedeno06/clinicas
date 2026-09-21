import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { superAdminGuard } from './core/guards/super-admin.guard';
import { staffGuard } from './core/guards/staff.guard';
import { citasGuard } from './core/guards/citas.guard';
import { LayoutComponent } from './features/layout/layout.component';
import { LoginComponent } from './features/login/login.component';
import { RestablecerPasswordComponent } from './features/restablecer-password/restablecer-password.component';
import { ConfirmarCambioEmailComponent } from './features/confirmar-cambio-email/confirmar-cambio-email.component';
import { ConsentimientoDatosComponent } from './features/consentimiento-datos/consentimiento-datos.component';
import { Recuperar2faComponent } from './features/recuperar-2fa/recuperar-2fa.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { PacientesComponent } from './features/pacientes/pacientes.component';
import { DoctoresComponent } from './features/doctores/doctores.component';
import { EspecialidadesComponent } from './features/especialidades/especialidades.component';
import { CitasComponent } from './features/citas/citas.component';
import { UsuariosComponent } from './features/usuarios/usuarios.component';
import { EmpresasComponent } from './features/empresas/empresas.component';
import { CatalogoAntecedentesComponent } from './features/catalogo-antecedentes/catalogo-antecedentes.component';
import { PoliticaPasswordComponent } from './features/politica-password/politica-password.component';
import { AuditoriaComponent } from './features/auditoria/auditoria.component';
import { CatalogoExamenesLaboratorioComponent } from './features/catalogo-examenes-laboratorio/catalogo-examenes-laboratorio.component';
import { SucursalesComponent } from './features/sucursales/sucursales.component';
import { CampanasComponent } from './features/campanas/campanas.component';
import { ReporteCampanasComponent } from './features/reportes/reporte-campanas/reporte-campanas.component';
import { ReporteCitasComponent } from './features/reportes/reporte-citas/reporte-citas.component';
import { ReporteDiagnosticosComponent } from './features/reportes/reporte-diagnosticos/reporte-diagnosticos.component';
import { ReporteMedicamentosComponent } from './features/reportes/reporte-medicamentos/reporte-medicamentos.component';
import { ReporteLaboratoriosComponent } from './features/reportes/reporte-laboratorios/reporte-laboratorios.component';
import { ReporteMapaCalorDiagnosticosComponent } from './features/reportes/reporte-mapa-calor-diagnosticos/reporte-mapa-calor-diagnosticos.component';
import { PerfilPacienteComponent } from './features/portal-paciente/perfil-paciente.component';
import { MisClinicasComponent } from './features/portal-paciente/mis-clinicas.component';
import { CitasPacienteComponent } from './features/portal-paciente/citas-paciente.component';
import { PerfilDoctorComponent } from './features/portal-doctor/perfil-doctor.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'restablecer-password', component: RestablecerPasswordComponent },
  { path: 'confirmar-cambio-email', component: ConfirmarCambioEmailComponent },
  { path: 'consentimiento-datos', component: ConsentimientoDatosComponent },
  { path: 'recuperar-2fa', component: Recuperar2faComponent },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: DashboardComponent, canActivate: [staffGuard] },
      { path: 'citas', component: CitasComponent, canActivate: [citasGuard] },
      { path: 'pacientes', component: PacientesComponent, canActivate: [staffGuard] },
      { path: 'doctores', component: DoctoresComponent, canActivate: [staffGuard] },
      { path: 'especialidades', component: EspecialidadesComponent, canActivate: [staffGuard] },
      { path: 'usuarios', component: UsuariosComponent, canActivate: [staffGuard] },
      { path: 'sucursales', component: SucursalesComponent, canActivate: [staffGuard] },
      { path: 'campanas', component: CampanasComponent, canActivate: [staffGuard] },
      { path: 'reportes/campanas', component: ReporteCampanasComponent, canActivate: [staffGuard] },
      { path: 'reportes/citas', component: ReporteCitasComponent, canActivate: [staffGuard] },
      { path: 'reportes/diagnosticos', component: ReporteDiagnosticosComponent, canActivate: [staffGuard] },
      { path: 'reportes/medicamentos', component: ReporteMedicamentosComponent, canActivate: [staffGuard] },
      { path: 'reportes/laboratorios', component: ReporteLaboratoriosComponent, canActivate: [staffGuard] },
      { path: 'reportes/mapa-calor-diagnosticos', component: ReporteMapaCalorDiagnosticosComponent, canActivate: [staffGuard] },
      { path: 'empresas', component: EmpresasComponent, canActivate: [superAdminGuard] },
      { path: 'catalogo-antecedentes', component: CatalogoAntecedentesComponent, canActivate: [superAdminGuard] },
      { path: 'politica-password', component: PoliticaPasswordComponent, canActivate: [superAdminGuard] },
      { path: 'auditoria', component: AuditoriaComponent, canActivate: [superAdminGuard] },
      { path: 'catalogo-examenes-laboratorio', component: CatalogoExamenesLaboratorioComponent, canActivate: [staffGuard] },
      { path: 'portal/perfil', component: PerfilPacienteComponent },
      { path: 'portal/citas', component: CitasPacienteComponent },
      { path: 'portal/clinicas', component: MisClinicasComponent },
      { path: 'portal-doctor/perfil', component: PerfilDoctorComponent },
    ],
  },
  { path: '**', redirectTo: '' },
];
