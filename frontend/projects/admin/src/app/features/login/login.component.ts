import { Component } from '@angular/core';
import { BrandLogoComponent } from '../../shared/brand-logo.component';

@Component({
  selector: 'app-login',
  imports: [BrandLogoComponent],
  template: `
    <div class="wrap">
      <div class="box">
        <div class="brand">
          <app-brand-logo [size]="52" />
          <span class="brand-name">Ponto<span>Tela</span></span>
          <p class="sub">Painel de mídia indoor</p>
        </div>
        <div class="card">
          <a class="primary" href="/auth/google">Entrar com Google</a>
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
    .card a.primary { display: block; width: 100%; text-align: center; text-decoration: none; }
  `],
})
export class LoginComponent {}
