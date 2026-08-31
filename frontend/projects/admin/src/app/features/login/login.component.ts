import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { BrandLogoComponent } from '../../shared/brand-logo.component';

@Component({
  selector: 'app-login',
  imports: [FormsModule, BrandLogoComponent],
  template: `
    <div class="wrap">
      <div class="box">
        <div class="brand">
          <app-brand-logo [size]="52" />
          <span class="brand-name">Ponto<span>Tela</span></span>
          <p class="sub">Painel de mídia indoor</p>
        </div>
        <div class="card">
          <label for="senha">Senha do painel</label>
          <input
            id="senha"
            type="password"
            [(ngModel)]="password"
            (keyup.enter)="submit()"
            placeholder="••••••••"
            autocomplete="current-password"
          />
          @if (error()) {
            <p class="error">{{ error() }}</p>
          }
          <button class="primary" (click)="submit()" [disabled]="loading()">
            {{ loading() ? 'Entrando…' : 'Entrar' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .box { width: 100%; max-width: 340px; }
    .brand { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-bottom: 22px; }
    .brand-name {
      font-family: var(--display); font-variation-settings: 'wdth' 76;
      font-weight: 800; font-size: 28px; letter-spacing: -.02em;
    }
    .brand-name span { color: var(--green-deep); }
    .brand .sub { margin: 0; color: var(--muted); font-size: 14px; }
    .card { margin-bottom: 0; }
    .card button.primary { width: 100%; }
    .error { color: var(--danger); font-size: 14px; margin: 10px 0 0; }
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
    } catch (err: any) {
      this.error.set(err?.error?.error || 'Senha inválida.');
    } finally {
      this.loading.set(false);
    }
  }
}
