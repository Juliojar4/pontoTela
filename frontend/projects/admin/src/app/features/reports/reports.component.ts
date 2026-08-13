import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Report, Screen } from '../../core/models';
import { ScreensService } from '../../core/screens.service';
import { ReportsService } from '../../core/reports.service';

@Component({
  selector: 'app-reports',
  imports: [FormsModule],
  template: `
    <div class="card">
      <h2>Relatório de exibições</h2>
      <div class="row">
        <div><label>De</label><input type="date" [(ngModel)]="from" /></div>
        <div><label>Até</label><input type="date" [(ngModel)]="to" /></div>
        <div>
          <label>Tela</label>
          <select [(ngModel)]="screenId">
            <option value="">Todas</option>
            @for (s of screens(); track s.id) {
              <option [value]="s.id">{{ s.name }}</option>
            }
          </select>
        </div>
      </div>
      <button class="primary" (click)="run()">Gerar</button>
      @if (result(); as r) {
        <div style="margin-top:16px">
          <div class="big">{{ r.total.toLocaleString('pt-BR') }} <span class="muted" style="font-size:14px">exibições no período</span></div>
          @if (rows().length) {
            <div class="table-wrap" style="margin-top:12px">
              <table>
                <tr><th>Anunciante</th><th>Exibições</th></tr>
                @for (row of rows(); track row[0]) {
                  <tr><td>{{ row[0] }}</td><td>{{ row[1].toLocaleString('pt-BR') }}</td></tr>
                }
              </table>
            </div>
          } @else {
            <p class="muted">Sem exibições no período.</p>
          }
        </div>
      }
    </div>
  `,
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

  async run(): Promise<void> {
    const r = await this.reportsService.run(this.from, this.to, this.screenId);
    this.result.set(r);
    this.rows.set(Object.entries(r.byAdvertiser).sort((a, b) => b[1] - a[1]));
  }
}
