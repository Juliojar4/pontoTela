import { Component, Input } from '@angular/core';

/** Marca PontoTela: a tela (o "ponto") com o pin de localização. */
@Component({
  selector: 'app-brand-logo',
  template: `
    <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 512 512" aria-hidden="true">
      <rect x="0" y="0" width="512" height="512" rx="112" fill="#1f9d5a" />
      <rect x="108" y="118" width="296" height="212" rx="26" fill="#f6f4ee" />
      <rect x="238" y="330" width="36" height="40" fill="#0e6a3a" />
      <rect x="188" y="366" width="136" height="26" rx="13" fill="#0e6a3a" />
      <path
        d="M256 152c-46 0-83 36-83 81 0 58 83 121 83 121s83-63 83-121c0-45-37-81-83-81z"
        fill="#1f9d5a"
      />
      <circle cx="256" cy="233" r="30" fill="#f6f4ee" />
    </svg>
  `,
  styles: [`
    :host { display: inline-flex; flex: none; }
    svg { display: block; border-radius: 22%; }
  `],
})
export class BrandLogoComponent {
  @Input() size = 32;
}
