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
          <a class="gsi" href="/auth/google">
            <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            <span>Fazer login com o Google</span>
          </a>
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
    .card { text-align: center; }
    /* Botao oficial do Google (tema claro das diretrizes de marca). */
    .gsi {
      display: inline-flex; align-items: center; justify-content: center; gap: 10px;
      min-height: 44px; max-width: 100%; padding: 0 16px 0 12px;
      background: #fff; border: 1px solid #747775; border-radius: 4px; color: #1f1f1f;
      font: 500 14px/20px Roboto, Arial, sans-serif; text-decoration: none; white-space: nowrap;
    }
    .gsi svg { flex: none; }
    .gsi:hover { background: #f2f2f2; box-shadow: 0 1px 2px rgba(60, 64, 67, .3), 0 1px 3px 1px rgba(60, 64, 67, .15); }
    .gsi:active { background: #e8e8e8; }
  `],
})
export class LoginComponent {}
