import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { ShellComponent } from './shell/shell.component';
import { LoginComponent } from './features/login/login.component';
import { ScreensComponent } from './features/screens/screens.component';
import { MediaComponent } from './features/media/media.component';
import { ScheduleComponent } from './features/schedule/schedule.component';
import { ReportsComponent } from './features/reports/reports.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'telas', pathMatch: 'full' },
      { path: 'telas', component: ScreensComponent },
      { path: 'midias', component: MediaComponent },
      { path: 'programacao', component: ScheduleComponent },
      { path: 'relatorios', component: ReportsComponent },
    ],
  },
  { path: '**', redirectTo: 'telas' },
];
