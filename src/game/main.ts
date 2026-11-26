import '../styles/fonts.css';
import '../styles/common.css';
import '../styles/game.css';
import { Sound } from './audio';
import { BaseGame } from './base';
import { Game } from './engine';
import { Input } from './input';
import { Storage } from './storage';
import { UI } from './ui';
import { Yandex } from './yandex';
import type { ClassId } from './types';

function must<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Элемент не найден: ${selector}`);
  return element;
}

const canvas = must<HTMLCanvasElement>('#game');
const storage = new Storage();
const sound = new Sound();
sound.muted = storage.data.muted;
sound.setMasterVolume(storage.data.masterVolume);
sound.setMusicSettings(storage.data.music.enabled, storage.data.music.volume);

const yandex = new Yandex();
const ui = new UI(storage, sound, yandex);
const input = new Input(
  must<HTMLElement>('#joystick'),
  must<HTMLElement>('#stick'),
  canvas,
  () => storage.data.bindings,
);

const game = new Game(canvas, input, sound, storage, yandex, {
  hud: (state) => ui.updateHud(state),
  levelUp: (choices) => ui.showLevelUp(choices),
  gameOver: (result) => ui.showGameOver(result),
  toast: (text) => ui.toast(text),
  tempShop: (ctx) => ui.showTempShop(ctx),
});
ui.attachGame(game);

let baseActive = false;

function leaveBase(): void {
  if (!baseActive) return;
  baseActive = false;
  base.stop();
  game.setExternalFrame(null);
  ui.setHudVisible(false);
  ui.showMenu();
}

const base = new BaseGame(canvas, storage, sound, {
  toast: (text) => ui.toast(text),
  onExit: () => {
    const toCampaign = base.lastExitKind === 'campaign';
    baseActive = false;
    base.stop();
    game.setExternalFrame(null);
    if (toCampaign) {
      const level = Math.max(1, Math.floor(storage.data.selectedLevel) || 1);
      ui.hideOverlay();
      ui.setHudVisible(true);
      game.start(storage.data.classId as ClassId, storage.data.weaponId, storage.data.modeId, level);
    } else {
      ui.setHudVisible(false);
      ui.showMenu();
    }
  },
  onSkinApplied: (id) => ui.toast(`СКИН: ${id.toUpperCase()}`),
});

ui.attachBase(() => {
  baseActive = true;
  sound.setMusic('explore');
  ui.hideOverlay();
  ui.setHudVisible(false);
  game.setExternalFrame((dt) => {
    base.update(dt);
    base.draw();
  });
  base.start();
});

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (ui.closeTempShop()) return;
  if (baseActive) leaveBase();
  else if (game.state === 'playing' || game.state === 'paused') ui.showPause();
});

window.addEventListener('pointerdown', () => sound.unlock(), { once: true });
window.addEventListener('beforeunload', () => {
  base.stop();
  game.dispose();
  sound.dispose();
});

// Отладочный доступ в dev-режиме: позволяет проверить прокачку и смерть без долгого забега.
if (import.meta.env.DEV) {
  (window as unknown as { __game?: Game }).__game = game;
  (window as unknown as { __base?: BaseGame }).__base = base;
}

const loader = {
  root: must<HTMLElement>('#loader'),
  fill: must<HTMLElement>('#loader-fill'),
  stage: must<HTMLElement>('#loader-stage'),
  percent: must<HTMLElement>('#loader-percent'),
  tip: must<HTMLElement>('#loader-tip'),
};

function loaderProgress(value: number, stage: string, tip?: string): void {
  loader.fill.style.width = `${value}%`;
  loader.percent.textContent = `${value}%`;
  loader.stage.textContent = stage;
  if (tip) loader.tip.textContent = tip;
}

const nextFrame = (): Promise<void> => new Promise((resolve) => {
  let done = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    resolve();
  };
  requestAnimationFrame(finish);
  window.setTimeout(finish, 120);
});

async function loadFonts(): Promise<void> {
  const loaded = Promise.all([
    document.fonts.load('700 1em "Playfair Display"'),
    document.fonts.load('400 1em "Golos Text"'),
    document.fonts.ready,
  ]);
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 2200));
  await Promise.race([loaded.then(() => undefined), timeout]);
}

async function startup(): Promise<void> {
  loaderProgress(12, 'Инициализация ядра…');
  await nextFrame();
  loaderProgress(38, 'Генерация 1000 уровней…', 'Совет: кампания открывает новые локации и уровни.');
  await nextFrame();
  loaderProgress(62, 'Настройка света и звука…', 'Совет: фонарик расходует заряд — собирай свечи и факелы.');
  await loadFonts();
  loaderProgress(88, 'Загрузка шрифтов…', 'Совет: собирай противоядия — враги отравляют, поджигают и заражают.');
  await nextFrame();
  ui.showMenu();
  void yandex.init().then(() => {
    if (game.state === 'idle') ui.showMenu();
  });
  loaderProgress(100, 'Мир готов. Входим…');
  await nextFrame();
  loader.root.classList.add('done');
  window.setTimeout(() => loader.root.remove(), 600);
}

void startup().catch(() => {
  loader.root.classList.add('done');
  ui.showMenu();
  window.setTimeout(() => loader.root.remove(), 600);
});
