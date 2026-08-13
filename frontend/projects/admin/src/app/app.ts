import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UiHostComponent } from './shared/ui-host.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, UiHostComponent],
  template: `
    <router-outlet />
    <app-ui-host />
  `,
})
export class App {}
