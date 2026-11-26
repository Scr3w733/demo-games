import type { ClassId, WeaponDef } from './types';

/**
 * Все персонажи и оружие рисуются процедурно в 32×32 и кэшируются:
 * мрачная палитра, никаких «рыцарей» из чужих паков и внешних зависимостей.
 */

const SIZE = 32;
const OUTLINE = '#07080a';
const cache = new Map<string, HTMLCanvasElement>();

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function box(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  fill: string, light: string, dark: string,
): void {
  rect(ctx, x, y, w, h, OUTLINE);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, fill);
  rect(ctx, x + 1, y + 1, w - 2, 1, light);
  rect(ctx, x + 1, y + h - 2, w - 2, 1, dark);
  rect(ctx, x + 1, y + 1, 1, h - 2, light);
  rect(ctx, x + w - 2, y + 1, 1, h - 2, dark);
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  rect(ctx, x - r, y - 1, r * 2 + 1, 2, color);
  rect(ctx, x - r + 1, y - 2, r * 2 - 1, 1, color);
  rect(ctx, x - r + 1, y + 2, r * 2 - 1, 1, color);
  rect(ctx, x - r + 2, y - 3, r * 2 - 3, 1, color);
  rect(ctx, x - r + 2, y + 3, r * 2 - 3, 1, color);
  rect(ctx, x - r + 4, y - r, r * 2 - 7, r * 2 + 1, color);
  rect(ctx, x - r + 2, y - r + 2, r * 2 - 3, r * 2 - 3, color);
}

function boot(ctx: CanvasRenderingContext2D, x: number, y: number, c: string, dark: string): void {
  box(ctx, x, y, 5, 6, c, '#8a857a', dark);
  rect(ctx, x, y + 5, 6, 2, OUTLINE);
}

function face(ctx: CanvasRenderingContext2D, skin: string, eye: string, y = 7): void {
  rect(ctx, 11, y - 2, 10, 8, OUTLINE);
  rect(ctx, 12, y - 1, 8, 6, skin);
  rect(ctx, 12, y - 1, 8, 1, '#e0c8ad');
  rect(ctx, 12, y + 4, 8, 1, '#8a6f5c');
  rect(ctx, 13, y + 1, 2, 1, eye);
  rect(ctx, 17, y + 1, 2, 1, eye);
  rect(ctx, 15, y + 3, 2, 1, '#6e5142');
}

function body(
  ctx: CanvasRenderingContext2D,
  c: string, light: string, dark: string,
  arm: string,
): void {
  box(ctx, 10, 14, 12, 10, c, light, dark);
  rect(ctx, 13, 15, 6, 7, dark);
  rect(ctx, 14, 15, 4, 2, light);
  box(ctx, 6, 15, 4, 8, arm, light, dark);
  box(ctx, 22, 15, 4, 8, arm, light, dark);
  boot(ctx, 11, 24, dark, OUTLINE);
  boot(ctx, 17, 24, dark, OUTLINE);
}

function humanoid(ctx: CanvasRenderingContext2D, id: ClassId): void {
  switch (id) {
    case 'mage': {
      body(ctx, '#6b59a0', '#8f7cc9', '#3d3459', '#5b4b86');
      face(ctx, '#c9ad93', '#9fd8e8');
      box(ctx, 11, 3, 10, 4, '#4f4178', '#8f7cc9', '#2b2442');
      rect(ctx, 9, 6, 14, 2, '#6b59a0');
      rect(ctx, 10, 2, 12, 1, '#c9ad93');
      rect(ctx, 15, 1, 2, 2, '#c9a24b');
      rect(ctx, 14, 2, 4, 2, '#9fd8e8');
      rect(ctx, 7, 16, 2, 2, '#c9a24b');
      rect(ctx, 5, 12, 2, 9, '#9a8a6c');
      disc(ctx, 5, 11, 3, '#8fbf63');
      break;
    }
    case 'ninja': {
      body(ctx, '#344552', '#5d7382', '#202b33', '#2c3945');
      rect(ctx, 10, 14, 12, 2, '#a33a3a');
      face(ctx, '#c9ad93', '#e8e4d8');
      rect(ctx, 10, 5, 12, 3, '#202b33');
      rect(ctx, 11, 7, 10, 1, '#7fa4b8');
      rect(ctx, 12, 8, 8, 2, '#202b33');
      rect(ctx, 13, 9, 2, 1, '#e8e4d8');
      rect(ctx, 17, 9, 2, 1, '#e8e4d8');
      rect(ctx, 6, 19, 3, 7, '#a33a3a');
      rect(ctx, 23, 19, 3, 7, '#a33a3a');
      break;
    }
    case 'soldier': {
      body(ctx, '#5d6a46', '#7f8d5e', '#39422f', '#4f5b3d');
      rect(ctx, 11, 15, 10, 3, '#3b4630');
      rect(ctx, 13, 16, 6, 1, '#c9a24b');
      face(ctx, '#c9ad93', '#2a2f37');
      box(ctx, 11, 4, 10, 4, '#4f5b3d', '#7f8d5e', '#39422f');
      rect(ctx, 10, 6, 12, 2, '#39422f');
      rect(ctx, 12, 6, 2, 1, '#c9ad93');
      rect(ctx, 18, 6, 2, 1, '#c9ad93');
      rect(ctx, 14, 18, 4, 3, '#8a6f45');
      rect(ctx, 6, 18, 4, 2, '#2a2f37');
      break;
    }
    case 'boxer': {
      body(ctx, '#b98360', '#d9a982', '#6d4a3a', '#c99a74');
      face(ctx, '#c99a74', OUTLINE);
      rect(ctx, 11, 4, 10, 2, '#4a3327');
      rect(ctx, 10, 6, 12, 1, '#4a3327');
      box(ctx, 4, 17, 6, 6, '#a33a3a', '#d05a5a', '#6a2020');
      box(ctx, 22, 17, 6, 6, '#a33a3a', '#d05a5a', '#6a2020');
      rect(ctx, 14, 16, 4, 3, '#d9c3a3');
      break;
    }
    case 'bandit': {
      body(ctx, '#4d4142', '#6b5751', '#37302f', '#5c4634');
      rect(ctx, 12, 15, 8, 6, '#6b5751');
      rect(ctx, 14, 16, 4, 1, '#8f3636');
      face(ctx, '#c19a7d', OUTLINE);
      box(ctx, 9, 3, 14, 3, '#5c4634', '#8a6b4c', '#372b20');
      rect(ctx, 10, 5, 12, 2, '#8f3636');
      rect(ctx, 8, 7, 16, 2, '#5c4634');
      rect(ctx, 11, 8, 10, 1, '#c19a7d');
      rect(ctx, 6, 18, 4, 2, '#8f3636');
      break;
    }
    case 'demolisher': {
      body(ctx, '#6a5335', '#8a6f45', '#3d3122', '#6b5a33');
      rect(ctx, 11, 16, 10, 4, '#3d3122');
      rect(ctx, 13, 17, 2, 2, '#c9a24b');
      rect(ctx, 17, 17, 2, 2, '#c9a24b');
      face(ctx, '#c9ad93', '#e8d6a0');
      box(ctx, 11, 3, 10, 4, '#6b5a33', '#c9a24b', '#3d3122');
      rect(ctx, 10, 6, 12, 2, '#c9a24b');
      rect(ctx, 12, 6, 2, 1, '#e8d6a0');
      rect(ctx, 18, 6, 2, 1, '#e8d6a0');
      rect(ctx, 22, 16, 5, 6, '#4a4230');
      rect(ctx, 24, 17, 2, 3, '#c9a24b');
      break;
    }
    case 'vampire': {
      body(ctx, '#7a2b38', '#a33a4a', '#4a1f2a', '#5c2430');
      rect(ctx, 12, 14, 8, 9, '#c7b0a6');
      rect(ctx, 14, 15, 4, 7, '#f0e8e0');
      face(ctx, '#c7b0a6', '#d4484c');
      rect(ctx, 11, 3, 10, 3, '#4a1f2a');
      rect(ctx, 10, 5, 3, 2, '#4a1f2a');
      rect(ctx, 19, 5, 3, 2, '#4a1f2a');
      rect(ctx, 15, 3, 2, 1, '#d4484c');
      rect(ctx, 5, 12, 4, 14, '#4a1f2a');
      rect(ctx, 23, 12, 4, 14, '#4a1f2a');
      break;
    }
    case 'vampire_prime': {
      body(ctx, '#8a1f2e', '#c9303f', '#5c1420', '#6e1826');
      rect(ctx, 14, 14, 4, 9, '#e05a5a');
      rect(ctx, 15, 15, 2, 7, '#f0c05a');
      face(ctx, '#d8c0b8', '#ff5a5a');
      box(ctx, 9, 2, 14, 4, '#5c1420', '#e05a5a', '#2a0810');
      rect(ctx, 9, 1, 3, 2, '#e05a5a');
      rect(ctx, 20, 1, 3, 2, '#e05a5a');
      rect(ctx, 14, 2, 4, 2, '#f0c05a');
      rect(ctx, 4, 11, 5, 16, '#5c1420');
      rect(ctx, 23, 11, 5, 16, '#5c1420');
      rect(ctx, 4, 10, 5, 1, '#e05a5a');
      rect(ctx, 23, 10, 5, 1, '#e05a5a');
      break;
    }
    case 'executioner': {
      body(ctx, '#4a4c52', '#8c8f96', '#282a2e', '#5c5f66');
      rect(ctx, 11, 15, 10, 3, '#8c8f96');
      face(ctx, '#c19a7d', OUTLINE);
      box(ctx, 10, 3, 12, 3, '#3e4046', '#8c8f96', '#202227');
      rect(ctx, 10, 6, 12, 2, '#8c8f96');
      rect(ctx, 12, 6, 2, 1, '#c19a7d');
      rect(ctx, 18, 6, 2, 1, '#c19a7d');
      rect(ctx, 24, 9, 3, 16, '#8c8f96');
      rect(ctx, 26, 8, 2, 5, '#d8dde0');
      rect(ctx, 25, 14, 4, 2, '#5c5f66');
      break;
    }
    case 'necromancer': {
      body(ctx, '#4e6347', '#7d9b6c', '#2b3827', '#3f5238');
      rect(ctx, 13, 15, 6, 8, '#7d9b6c');
      face(ctx, '#a8b79a', '#8fbf63');
      box(ctx, 11, 3, 10, 4, '#3f5238', '#7d9b6c', '#2b3827');
      rect(ctx, 9, 6, 14, 2, '#5a7050');
      rect(ctx, 13, 7, 2, 1, '#8fbf63');
      rect(ctx, 17, 7, 2, 1, '#8fbf63');
      rect(ctx, 4, 8, 2, 21, '#9a8a6c');
      disc(ctx, 4, 7, 4, '#8fbf63');
      rect(ctx, 3, 6, 2, 2, '#d8f0a0');
      break;
    }
  }
}

function enemy(ctx: CanvasRenderingContext2D, id: string): void {
  switch (id) {
    case 'skeleton': {
      rect(ctx, 11, 22, 4, 7, '#8f8a7d');
      rect(ctx, 17, 22, 4, 7, '#8f8a7d');
      rect(ctx, 10, 28, 6, 2, '#c9c4b4');
      rect(ctx, 17, 28, 6, 2, '#c9c4b4');
      box(ctx, 10, 13, 12, 10, '#b9b4a5', '#e0ddd0', '#8f8a7d');
      for (let i = 0; i < 4; i += 1) {
        rect(ctx, 12 + i * 3, 14, 1, 7, '#6e6a60');
      }
      rect(ctx, 11, 4, 10, 8, OUTLINE);
      rect(ctx, 12, 5, 8, 6, '#c9c4b4');
      rect(ctx, 13, 7, 2, 2, OUTLINE);
      rect(ctx, 17, 7, 2, 2, OUTLINE);
      rect(ctx, 15, 9, 2, 1, '#8f8a7d');
      rect(ctx, 13, 11, 6, 1, '#e0ddd0');
      rect(ctx, 5, 14, 5, 3, '#c9c4b4');
      rect(ctx, 22, 14, 5, 3, '#c9c4b4');
      rect(ctx, 22, 7, 3, 11, '#9a8a6c');
      rect(ctx, 20, 5, 7, 3, '#9a8a6c');
      break;
    }
    case 'zombie': {
      body(ctx, '#69745d', '#8a9676', '#4a503f', '#7b876b');
      rect(ctx, 11, 16, 3, 3, '#3d4435');
      rect(ctx, 18, 17, 3, 2, '#3d4435');
      rect(ctx, 12, 7, 9, 8, '#7b876b');
      rect(ctx, 13, 9, 2, 1, '#c8d06a');
      rect(ctx, 17, 9, 3, 1, '#c8d06a');
      rect(ctx, 13, 12, 7, 1, '#3d4435');
      rect(ctx, 15, 13, 3, 1, '#9c5a4a');
      rect(ctx, 9, 4, 12, 3, '#4a503f');
      rect(ctx, 12, 5, 3, 1, '#7b876b');
      rect(ctx, 4, 16, 5, 5, '#69745d');
      rect(ctx, 23, 17, 5, 5, '#69745d');
      rect(ctx, 24, 16, 2, 2, '#9c5a4a');
      break;
    }
    case 'vampire': {
      body(ctx, '#7a2b38', '#a33a4a', '#4a1f2a', '#5c2430');
      rect(ctx, 12, 14, 8, 9, '#c7b0a6');
      face(ctx, '#c7b0a6', '#d4484c');
      box(ctx, 11, 3, 10, 3, '#4a1f2a', '#7a2b38', '#2a1018');
      rect(ctx, 10, 5, 3, 2, '#4a1f2a');
      rect(ctx, 19, 5, 3, 2, '#4a1f2a');
      rect(ctx, 5, 12, 4, 15, '#4a1f2a');
      rect(ctx, 23, 12, 4, 15, '#4a1f2a');
      rect(ctx, 14, 17, 1, 3, '#f0e8e0');
      rect(ctx, 17, 17, 1, 3, '#f0e8e0');
      break;
    }
    case 'ghost': {
      ctx.globalAlpha = 0.78;
      rect(ctx, 11, 5, 10, 11, '#7f9bab');
      rect(ctx, 12, 6, 8, 9, '#b8ccd6');
      rect(ctx, 13, 7, 2, 3, '#1d2a33');
      rect(ctx, 17, 7, 2, 3, '#1d2a33');
      rect(ctx, 14, 11, 4, 1, '#1d2a33');
      rect(ctx, 10, 15, 12, 9, '#a2bcc9');
      for (let i = 0; i < 4; i += 1) {
        rect(ctx, 10 + i * 3, 22, 2, 5, '#b8ccd6');
      }
      rect(ctx, 8, 13, 3, 8, '#9fb6c4');
      rect(ctx, 21, 13, 3, 8, '#9fb6c4');
      ctx.globalAlpha = 1;
      break;
    }
    case 'cultist': {
      body(ctx, '#5c4375', '#8a69ad', '#352744', '#4a355f');
      rect(ctx, 13, 15, 6, 8, '#2a1f36');
      rect(ctx, 15, 16, 2, 5, '#d6a8ff');
      rect(ctx, 11, 4, 10, 9, '#4a355f');
      rect(ctx, 12, 6, 8, 4, '#1d1626');
      rect(ctx, 13, 7, 2, 1, '#d6a8ff');
      rect(ctx, 17, 7, 2, 1, '#d6a8ff');
      rect(ctx, 11, 2, 10, 3, '#5c4375');
      rect(ctx, 14, 1, 4, 1, '#c9a24b');
      rect(ctx, 4, 10, 2, 17, '#9a8a6c');
      disc(ctx, 4, 9, 3, '#d6a8ff');
      break;
    }
    case 'boss': {
      box(ctx, 7, 13, 18, 12, '#a89c83', '#d0c4a8', '#8b8069');
      for (let i = 0; i < 5; i += 1) rect(ctx, 9 + i * 3, 15, 1, 8, '#6e6555');
      box(ctx, 8, 3, 16, 10, '#8b8069', '#c2b69c', '#6e6555');
      rect(ctx, 9, 5, 4, 3, '#a33a3a');
      rect(ctx, 19, 5, 4, 3, '#a33a3a');
      rect(ctx, 10, 5, 2, 1, '#f0d68a');
      rect(ctx, 20, 5, 2, 1, '#f0d68a');
      rect(ctx, 13, 9, 6, 2, OUTLINE);
      rect(ctx, 14, 10, 4, 1, '#c9c4b4');
      rect(ctx, 6, 1, 3, 3, '#c9a24b');
      rect(ctx, 14, 1, 4, 3, '#c9a24b');
      rect(ctx, 23, 1, 3, 3, '#c9a24b');
      rect(ctx, 3, 13, 4, 8, '#c2b69c');
      rect(ctx, 25, 13, 4, 8, '#c2b69c');
      rect(ctx, 9, 25, 6, 5, '#8b8069');
      rect(ctx, 18, 25, 6, 5, '#8b8069');
      break;
    }
  }
}

export function characterSprite(key: string): HTMLCanvasElement {
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;

  if (key.startsWith('class:')) humanoid(ctx, key.slice(6) as ClassId);
  else if (key.startsWith('enemy:')) enemy(ctx, key.slice(6));

  cache.set(key, canvas);
  return canvas;
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Детализированная модель оружия в руках, повёрнутая к цели. */
export function drawHeldWeapon(
  ctx: CanvasRenderingContext2D,
  weapon: WeaponDef,
  x: number,
  y: number,
  angle: number,
  scale = 1,
): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  const seed = hashId(weapon.id);
  const steel = seed % 3 === 0 ? '#b8bec4' : seed % 3 === 1 ? '#a8b2b8' : '#c8c9c0';
  const dark = '#3a3d42';
  const grip = weapon.classId === 'necromancer' || weapon.classId === 'mage' ? '#5b4b86' : '#4a3527';

  if (weapon.kind === 'melee') {
    rect(ctx, 0, -1, 7, 3, grip);
    rect(ctx, 5, -3, 2, 7, '#c9a24b');
    rect(ctx, 7, -2, 11, 4, OUTLINE);
    rect(ctx, 8, -1, 10, 2, steel);
    rect(ctx, 8, -1, 10, 1, '#f0f0e8');
    rect(ctx, 17, -3, 3, 6, '#dfe6e8');
    ctx.restore();
    return;
  }
  if (weapon.kind === 'orb' || weapon.kind === 'nova') {
    rect(ctx, -1, -1, 9, 3, grip);
    rect(ctx, 7, -4, 4, 8, OUTLINE);
    rect(ctx, 8, -3, 2, 6, weapon.color);
    rect(ctx, 8, -2, 1, 3, '#f4ecd8');
    ctx.restore();
    return;
  }
  if (weapon.kind === 'flame') {
    rect(ctx, 1, -2, 12, 5, '#4a4230');
    rect(ctx, 2, -1, 9, 2, '#8a6f45');
    rect(ctx, 13, -3, 4, 7, OUTLINE);
    rect(ctx, 14, -2, 2, 5, weapon.color);
    rect(ctx, 15, -3, 2, 2, '#f0d68a');
    ctx.restore();
    return;
  }
  if (weapon.kind === 'mine' || weapon.kind === 'explosive') {
    rect(ctx, 3, -4, 9, 9, OUTLINE);
    rect(ctx, 4, -3, 7, 7, '#4a4230');
    rect(ctx, 5, -2, 5, 3, '#8a6f45');
    rect(ctx, 7, -1, 2, 2, weapon.color);
    rect(ctx, 11, -5, 2, 2, '#c9a24b');
    ctx.restore();
    return;
  }

  // Огнестрел: по ID определяем силуэт — пистолет, дробовик, винтовка или снайперка.
  const id = weapon.id;
  const isPistol = id.includes('pistol') || id.includes('revolver');
  const isShotgun = id.includes('shotgun') || id.includes('double') || id.includes('saw');
  const isSniper = id.includes('sniper') || id.includes('rifle') || id.includes('long');
  const isLauncher = id.includes('rocket') || id.includes('launcher') || id.includes('grenade');

  if (isPistol) {
    rect(ctx, -1, -2, 6, 4, grip);
    rect(ctx, 4, -2, 8, 4, OUTLINE);
    rect(ctx, 5, -1, 6, 2, steel);
    rect(ctx, 2, 2, 3, 4, grip);
    rect(ctx, 10, -2, 3, 4, dark);
  } else if (isShotgun) {
    rect(ctx, -2, -2, 16, 5, OUTLINE);
    rect(ctx, -1, -1, 13, 2, steel);
    rect(ctx, 12, -2, 3, 5, '#6a4c31');
    rect(ctx, 3, 3, 5, 3, grip);
    rect(ctx, -2, 0, 4, 3, dark);
  } else if (isSniper) {
    rect(ctx, -3, -2, 22, 4, OUTLINE);
    rect(ctx, -2, -1, 17, 2, steel);
    rect(ctx, 14, 0, 5, 2, dark);
    rect(ctx, 4, -4, 7, 2, '#4a5058');
    rect(ctx, 5, -5, 5, 1, '#9fd8e8');
    rect(ctx, 2, 2, 4, 4, grip);
  } else if (isLauncher) {
    rect(ctx, 0, -4, 15, 8, OUTLINE);
    rect(ctx, 1, -3, 12, 5, '#4f5b3d');
    rect(ctx, 3, -2, 7, 2, '#8a9676');
    rect(ctx, 14, -4, 4, 8, dark);
    rect(ctx, 15, -2, 2, 3, weapon.color);
    rect(ctx, 4, 4, 4, 3, grip);
  } else {
    // Универсальный автомат/пистолет-пулемёт.
    rect(ctx, -2, -2, 18, 5, OUTLINE);
    rect(ctx, -1, -1, 14, 2, steel);
    rect(ctx, 12, -2, 4, 5, dark);
    rect(ctx, 2, 3, 4, 5, grip);
    rect(ctx, 6, 3, 3, 4, dark);
    rect(ctx, 0, -3, 3, 2, '#4a5058');
    if (seed % 4 === 0) rect(ctx, 15, -2, 2, 4, weapon.color);
  }
  ctx.restore();
}

/**
 * Детализированная модель портала: каменная арка, руны и вихрь.
 * Рисуется один раз в кэше, а анимация (вращение/пульсация) добавляется в движке.
 */
export function portalSprite(): HTMLCanvasElement {
  const key = 'model:portal';
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const glow = ctx.createRadialGradient(32, 42, 2, 32, 42, 36);
  glow.addColorStop(0, 'rgba(180,124,224,0.42)');
  glow.addColorStop(0.55, 'rgba(112,72,150,0.16)');
  glow.addColorStop(1, 'rgba(40,24,60,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 80);

  // Каменная рама с тёмным контуром и боковыми блоками.
  rect(ctx, 11, 10, 42, 62, OUTLINE);
  rect(ctx, 13, 12, 38, 58, '#2b2732');
  rect(ctx, 14, 13, 36, 2, '#4a4052');
  rect(ctx, 14, 68, 36, 2, '#17151c');
  for (let y = 16; y < 68; y += 9) {
    rect(ctx, 11, y, 6, 7, '#18161d');
    rect(ctx, 47, y, 6, 7, '#18161d');
    rect(ctx, 12, y, 1, 6, '#443a4c');
    rect(ctx, 47, y + 1, 1, 6, '#0c0b10');
  }

  // Арочный проём.
  ctx.beginPath();
  ctx.moveTo(20, 67);
  ctx.lineTo(20, 37);
  ctx.arc(32, 37, 12, Math.PI, 0);
  ctx.lineTo(44, 67);
  ctx.closePath();
  ctx.fillStyle = '#08080c';
  ctx.fill();
  ctx.strokeStyle = '#5d4b6f';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Руны по бокам арки.
  for (let i = 0; i < 6; i += 1) {
    const y = 22 + i * 8;
    const shade = i % 2 === 0 ? '#b47ce0' : '#7a5a9a';
    rect(ctx, 15, y, 3, 1, shade);
    rect(ctx, 15, y + 3, 1, 3, shade);
    rect(ctx, 46, y + 2, 3, 1, shade);
    rect(ctx, 48, y, 1, 3, shade);
  }

  // Вихрь внутри проёма.
  ctx.save();
  ctx.beginPath();
  ctx.arc(32, 43, 12, 0, Math.PI * 2);
  ctx.clip();
  const vortex = ctx.createRadialGradient(32, 43, 1, 32, 43, 13);
  vortex.addColorStop(0, '#f6e7ff');
  vortex.addColorStop(0.22, '#b47ce0');
  vortex.addColorStop(0.6, '#553377');
  vortex.addColorStop(1, '#0d0a14');
  ctx.fillStyle = vortex;
  ctx.fillRect(19, 30, 26, 26);
  ctx.strokeStyle = 'rgba(232,207,255,0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.ellipse(32, 43, 3 + i * 3.5, 7 + i * 1.5, i * 0.4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Основание и упавшие обломки.
  rect(ctx, 8, 70, 48, 5, OUTLINE);
  rect(ctx, 10, 70, 44, 3, '#393341');
  rect(ctx, 14, 71, 12, 1, '#4d4456');
  rect(ctx, 38, 72, 9, 1, '#1d1a22');

  cache.set(key, canvas);
  return canvas;
}

/** Детализированное дерево для густых лесов: ствол, ярусы хвои, снег/блики. */
export function treeSprite(tint: number, snow: boolean): HTMLCanvasElement {
  const key = `model:tree:${tint}:${snow ? 1 : 0}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const greens = ['#1f4a35', '#264f38', '#1a3c2d'];
  const lights = ['#3d6b48', '#456f4c', '#345f43'];
  const dark = greens[tint % greens.length];
  const light = lights[tint % lights.length];

  rect(ctx, 21, 36, 6, 26, OUTLINE);
  rect(ctx, 22, 38, 4, 23, '#3a2c22');
  rect(ctx, 22, 38, 1, 23, '#58402e');

  for (let layer = 0; layer < 4; layer += 1) {
    const top = 4 + layer * 10;
    const half = 8 + layer * 4;
    ctx.beginPath();
    ctx.moveTo(24, top);
    ctx.lineTo(24 - half, top + 14);
    ctx.lineTo(24 + half, top + 14);
    ctx.closePath();
    ctx.fillStyle = OUTLINE;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(24, top + 2);
    ctx.lineTo(24 - half + 1, top + 12);
    ctx.lineTo(24 + half - 1, top + 12);
    ctx.closePath();
    ctx.fillStyle = dark;
    ctx.fill();
    rect(ctx, 24 - half + 2, top + 11, half * 2 - 4, 2, light);
    rect(ctx, 24 - 2, top + 4, 2, 8, light);
    if (snow) {
      rect(ctx, 24 - 4, top + 2, 8, 1, '#c3d0d2');
      rect(ctx, 24 - half + 3, top + 11, half * 2 - 6, 1, '#9fadb0');
    }
  }
  rect(ctx, 18, 60, 12, 2, OUTLINE);
  rect(ctx, 19, 60, 10, 1, '#2c3a2c');

  cache.set(key, canvas);
  return canvas;
}

