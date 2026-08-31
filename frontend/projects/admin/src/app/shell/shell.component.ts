import { Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { BrandLogoComponent } from '../shared/brand-logo.component';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, BrandLogoComponent],
  template: `
    <header>
      <div class="bar">
        <a class="brand" routerLink="/telas">
          <app-brand-logo [size]="32" />
          <span class="brand-name">Ponto<span>Tela</span></span>
          <span class="brand-tag">painel</span>
        </a>
        <span class="spacer"></span>
        <button class="ghost" (click)="logout()">Sair</button>
      </div>
      <nav>
        <a routerLink="/telas" routerLinkActive="active">Telas</a>
        <a routerLink="/midias" routerLinkActive="active">Mídias</a>
        <a routerLink="/programacao" routerLinkActive="active">Programação</a>
        <a routerLink="/relatorios" routerLinkActive="active">Relatórios</a>
      </nav>
    </header>
    <main>
      <router-outlet />
    </main>
  `,
  styles: [`
    header {
      position: sticky; top: 0; z-index: 50;
      background: rgba(236, 232, 222, .92);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--line);
    }
    .bar {
      max-width: 1100px; margin: 0 auto;
      display: flex; align-items: center; gap: 12px;
      padding: 14px 24px 10px;
    }
    .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: inherit; }
    .brand-name {
      font-family: var(--display); font-variation-settings: 'wdth' 76;
      font-weight: 800; font-size: 21px; letter-spacing: -.02em;
    }
    .brand-name span { color: var(--green-deep); }
    .brand-tag {
      font-family: var(--display); font-variation-settings: 'wdth' 90;
      font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
      color: var(--muted); border-left: 1px solid var(--line); padding-left: 10px; margin-left: 2px;
    }
    .spacer { flex: 1; }

    nav {
      max-width: 1100px; margin: 0 auto;
      display: flex; gap: 4px; padding: 0 24px;
      overflow-x: auto; -webkit-overflow-scrolling: touch;
    }
    nav a {
      font-family: var(--display); font-variation-settings: 'wdth' 88;
      font-weight: 700; font-size: 14px; letter-spacing: .02em;
      color: var(--muted); text-decoration: none; white-space: nowrap;
      padding: 8px 14px 10px; border-bottom: 2.5px solid transparent;
      transition: color .15s, border-color .15s;
    }
    nav a:hover { color: var(--txt); border-bottom-color: var(--line); }
    nav a.active { color: var(--green-deep); border-bottom-color: var(--green); }

    main { max-width: 1100px; margin: 0 auto; padding: 28px 24px 56px; display: block; }

    @media (max-width: 640px) {
      .bar { padding: 12px 16px 8px; gap: 8px; }
      .brand-name { font-size: 18px; }
      .brand-tag { display: none; }
      nav { padding: 0 16px; }
      nav a { padding: 8px 11px 10px; font-size: 13px; }
      main { padding: 20px 16px 40px; }
    }
  `],
})
export class ShellComponent {
  constructor(private auth: AuthService, private router: Router) {}

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }
}
