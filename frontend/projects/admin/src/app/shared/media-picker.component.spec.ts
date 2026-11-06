import { Media } from '../core/models';
import { filterMedia } from './media-picker.component';

const media = (id: string, type: Media['type'], advertiser: string, createdAt: number): Media =>
  ({ id, filename: id, originalName: `${id}.bin`, type, advertiser, createdAt });

describe('filterMedia', () => {
  const items = [media('a', 'image', 'Pizzaria do João', 1), media('b', 'video', 'Padaria', 2)];

  it('mostra as mais recentes primeiro sem alterar a lista original', () => {
    expect(filterMedia(items, '', 'all').map((m) => m.id)).toEqual(['b', 'a']);
    expect(items[0].id).toBe('a');
  });

  it('filtra por tipo', () => {
    expect(filterMedia(items, '', 'video').map((m) => m.id)).toEqual(['b']);
  });

  it('busca ignorando acentos e maiúsculas', () => {
    expect(filterMedia(items, 'JOAO', 'all').map((m) => m.id)).toEqual(['a']);
    expect(filterMedia(items, 'b.bin', 'all').map((m) => m.id)).toEqual(['b']);
  });
});
