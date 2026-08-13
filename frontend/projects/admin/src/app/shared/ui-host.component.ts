import { Component } from '@angular/core';
import { UiService } from '../core/ui.service';

@Component({
  selector: 'app-ui-host',
  template: `
    <div class="toasts">
      @for (t of ui.toasts(); track t.id) {
        <div class="toast" [class]="t.kind" (click)="ui.dismiss(t.id)">{{ t.message }}</div>
      }
    </div>
    @if (ui.confirmRequest(); as req) {
      <div class="overlay" (click)="ui.resolveConfirm(false)">
        <div class="dialog" (click)="$event.stopPropagation()">
          <p>{{ req.message }}</p>
          <div class="actions">
            <button class="ghost" (click)="ui.resolveConfirm(false)">cancelar</button>
            <button class="danger" (click)="ui.resolveConfirm(true)">confirmar</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .toasts { position: fixed; top: 16px; right: 16px; z-index: 1000; display: flex; flex-direction: column; gap: 8px; max-width: calc(100vw - 32px); }
    .toast {
      background: var(--card); border: 1px solid var(--line); color: var(--txt);
      padding: 12px 16px; border-radius: 10px; font-size: 14px; box-shadow: 0 8px 24px rgba(0,0,0,.35);
      cursor: pointer; animation: slide-in .15s ease-out;
    }
    .toast.success { border-color: var(--ok); }
    .toast.error { border-color: var(--danger); }
    @keyframes slide-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }

    .overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 1001;
      display: flex; align-items: center; justify-content: center; padding: 16px;
    }
    .dialog {
      background: var(--card); border: 1px solid var(--line); border-radius: 12px;
      padding: 20px; width: 100%; max-width: 340px;
    }
    .dialog p { margin: 0 0 16px; font-size: 14px; color: var(--txt); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    button.danger { background: var(--danger); color: #fff; border: 0; padding: 8px 14px; border-radius: 7px; cursor: pointer; font-size: 13px; }
  `],
})
export class UiHostComponent {
  constructor(readonly ui: UiService) {}
}
