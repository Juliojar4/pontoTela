import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Screen } from '../../core/models';
import { ScreensService } from '../../core/screens.service';

@Component({
  selector: 'app-screens',
  imports: [FormsModule],
  template: `
    <div class="card">
      <h2>Nova tela (ponto)</h2>
      <div class="row">
        <div><label>Nome</label><input [(ngModel)]="name" placeholder="Academia Fit Center" /></div>
        <div><label>Local</label><input [(ngModel)]="location" placeholder="Recepção" /></div>
      </div>
      <button class="primary" (click)="add()">Adicionar tela</button>
    </div>
    <div class="card">
      <h2>Telas cadastradas</h2>
      @if (screens().length) {
        <table>
          <tr><th>Nome</th><th>Local</th><th>Link do player</th><th></th></tr>
          @for (s of screens(); track s.id) {
            <tr>
              <td>{{ s.name }}</td>
              <td class="muted">{{ s.location || '—' }}</td>
              <td><a class="link" [href]="'/player/?screen=' + s.id" target="_blank">abrir player ↗</a></td>
              <td><button class="del" (click)="remove(s.id)">excluir</button></td>
            </tr>
          }
        </table>
      } @else {
        <div class="empty">Nenhuma tela ainda. Cada tela vira uma URL que você abre na TV/box.</div>
      }
    </div>
  `,
})
export class ScreensComponent implements OnInit {
  readonly screens = signal<Screen[]>([]);
  name = '';
  location = '';

  constructor(private screensService: ScreensService) {}

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.screens.set(await this.screensService.list());
  }

  async add(): Promise<void> {
    if (!this.name.trim()) { alert('Dê um nome à tela'); return; }
    await this.screensService.create(this.name.trim(), this.location.trim());
    this.name = '';
    this.location = '';
    await this.refresh();
  }

  async remove(id: string): Promise<void> {
    if (!confirm('Excluir esta tela?')) return;
    await this.screensService.remove(id);
    await this.refresh();
  }
}
