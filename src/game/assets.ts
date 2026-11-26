/**
 * Загрузка CC0-ресурсов из public/assets/cc0.
 * Картинки подгружаются лениво: игра сразу стартует на процедурной графике,
 * а настоящие тайлы и кадры анимации появляются, когда файлы готовы.
 */

const cache = new Map<string, HTMLImageElement>();
const failed = new Set<string>();

function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || './';
  return new URL(`${base}assets/cc0/${path}`, document.baseURI).href;
}

/** Возвращает готовую картинку или null, пока она грузится/недоступна. */
export function cc0Image(path: string): HTMLImageElement | null {
  if (failed.has(path)) return null;
  let image = cache.get(path);
  if (!image) {
    image = new Image();
    image.decoding = 'async';
    image.onerror = () => { failed.add(path); };
    image.src = assetUrl(path);
    cache.set(path, image);
  }
  return image.complete && image.naturalWidth > 0 ? image : null;
}

/** Предзагрузка самых нужных файлов, чтобы смена кадра не вызывала задержку. */
export function preloadCc0(paths: readonly string[]): void {
  for (const path of paths) cc0Image(path);
}

export const CC0_PATHS = {
  floor: '0x72/tiles/atlas_floor-16x16.png',
  topdown: 'microfantasy/tilesets/topdown.png',
  jungle: 'microfantasy/tilesets/topdown_jungle.png',
} as const;
