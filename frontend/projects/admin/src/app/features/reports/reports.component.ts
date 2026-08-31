import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Report, Screen } from '../../core/models';
import { ScreensService } from '../../core/screens.service';
import { ReportsService } from '../../core/reports.service';

@Component({
  selector: 'app-reports',
  imports: [FormsModule],
  template: `
    <div class="page-head">
      <h1>Relatórios</h1>
      <span class="sub">Sua prova de entrega para o anunciante</span>
    </div>

    <div class="card">
      <h2>Filtrar exibições</h2>
      <div class="row">
        <div><label>De</label><input type="date" [(ngModel)]="from" /></div>
        <div><label>Até</label><input type="date" [(ngModel)]="to" /></div>
        <div>
          <label>Tela</label>
          <select [(ngModel)]="screenId">
            <option value="">Todas as telas</option>
            @for (s of screens(); track s.id) {
              <option [value]="s.id">{{ s.name }}</option>
            }
          </select>
        </div>
        <div class="tight"><button class="primary inline" (click)="run()">Gerar</button></div>
      </div>
    </div>

    @if (result(); as r) {
      <div class="card total">
        <span class="big">{{ r.total.toLocaleString('pt-BR') }}</span>
        <span class="unit">exibições no período</span>
      </div>

      <div class="card">
        <h2>Por anunciante</h2>
        @if (rows().length) {
          <ul class="bars">
            @for (row of rows(); track row[0]) {
              <li>
                <span class="name">{{ row[0] }}</span>
                <span class="track"><span class="fill" [style.width.%]="percent(row[1])"></span></span>
                <span class="count">{{ row[1].toLocaleString('pt-BR') }}</span>
              </li>
            }
          </ul>
        } @else {
          <div class="empty">Sem exibições no período escolhido.</div>
        }
      </div>
    }
  `,
  styles: [`
    .total { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; background: var(--green-soft); border-color: var(--green); }
    .total .big { color: var(--green-deep); }
    .total .unit { color: var(--green-deep); font-size: 15px; }

    .bars { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .bars li { display: grid; grid-template-columns: minmax(120px, 1fr) 2fr auto; align-items: center; gap: 14px; }
    .bars .name {
      font-family: var(--display); font-variation-settings: 'wdth' 84; font-weight: 700;
      font-size: 15px; overflow-wrap: anywhere;
    }
    .bars .track { height: 12px; background: var(--paper-2); border-radius: 999px; overflow: hidden; }
    .bars .fill { display: block; height: 100%; background: var(--green); border-radius: 999px; min-width: 3px; }
    .bars .count {
      font-family: var(--display); font-variation-settings: 'wdth' 84; font-weight: 700;
      font-size: 15px; color: var(--txt); text-align: right; white-space: nowrap;
    }

    @media (max-width: 640px) {
      .bars li { grid-template-columns: 1fr auto; }
      .bars .track { grid-column: 1 / -1; }
    }
  `],
})
export class ReportsComponent implements OnInit {
  readonly screens = signal<Screen[]>([]);
  readonly result = signal<Report | null>(null);
  readonly rows = signal<[string, number][]>([]);
  from = '';
  to = '';
  screenId = '';

  constructor(private screensService: ScreensService, private reportsService: ReportsService) {}

  async ngOnInit(): Promise<void> {
    this.screens.set(await this.screensService.list());
  }

  /** Barra proporcional ao anunciante que mais apareceu. */
  percent(value: number): number {
    const top = this.rows()[0]?.[1] ?? 0;
    return top ? (value / top) * 100 : 0;
  }

  async run(): Promise<void> {
    const r = await this.reportsService.run(this.from, this.to, this.screenId);
    this.result.set(r);
    this.rows.set(Object.entries(r.byAdvertiser).sort((a, b) => b[1] - a[1]));
  }
}
