import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <div class="wrap">
      <div class="card">
        <h2>Entrar no painel</h2>
        <label>Senha</label>
        <input type="password" [(ngModel)]="password" (keyup.enter)="submit()" placeholder="••••••••" />
        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
        <button class="primary" (click)="submit()" [disabled]="loading()">
          {{ loading() ? 'Entrando…' : 'Entrar' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { width: 280px; }
    .error { color: var(--danger); font-size: 13px; margin: 8px 0 0; }
  `],
})
export class LoginComponent {
  password = '';
  readonly loading = signal(false);
  readonly error = signal('');

  constructor(private auth: AuthService, private router: Router) {}

  async submit(): Promise<void> {
    if (!this.password) return;
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.password);
      this.router.navigate(['/telas']);
    } catch {
      this.error.set('Senha inválida.');
    } finally {
      this.loading.set(false);
    }
  }
}
