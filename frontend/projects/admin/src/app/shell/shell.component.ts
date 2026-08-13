import { Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <header>
      <span class="dot"></span>
      <h1>CMS de Mídia Indoor</h1>
      <span class="spacer"></span>
      <button class="ghost" (click)="logout()">sair</button>
    </header>
    <nav>
      <a routerLink="/telas" routerLinkActive="active">Telas</a>
      <a routerLink="/midias" routerLinkActive="active">Mídias</a>
      <a routerLink="/programacao" routerLinkActive="active">Programação</a>
      <a routerLink="/relatorios" routerLinkActive="active">Relatórios</a>
    </nav>
    <main>
      <router-outlet />
    </main>
  `,
  styles: [`
    header { padding: 16px 22px; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 14px; }
    header h1 { font-size: 17px; margin: 0; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--ok); flex-shrink: 0; }
    .spacer { flex: 1; }
    nav { display: flex; gap: 4px; padding: 12px 18px; border-bottom: 1px solid var(--line); overflow-x: auto; -webkit-overflow-scrolling: touch; }
    nav a { color: var(--muted); padding: 8px 14px; border-radius: 8px; text-decoration: none; font-size: 14px; white-space: nowrap; }
    nav a.active { background: var(--card); color: var(--txt); }
    main { max-width: 940px; margin: 0 auto; padding: 22px; display: block; }
    button.ghost { background: transparent; border: 1px solid var(--line); color: var(--txt); padding: 6px 11px; border-radius: 7px; cursor: pointer; font-size: 13px; flex-shrink: 0; }

    @media (max-width: 640px) {
      header { padding: 12px 14px; gap: 10px; }
      header h1 { font-size: 15px; }
      nav { padding: 10px 14px; gap: 2px; }
      nav a { padding: 8px 12px; font-size: 13px; }
      main { padding: 14px; }
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
