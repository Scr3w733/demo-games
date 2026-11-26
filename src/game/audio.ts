import type { WeaponKind } from './types';

type Wave = OscillatorType;
type FilterKind = BiquadFilterType;
type NoiseColor = 'white' | 'brown';

interface NoiseOptions {
  type?: FilterKind;
  from: number;
  to?: number;
  q?: number;
  attack?: number;
  wobble?: { rate: number; depth: number };
  color?: NoiseColor;
  /** Громкая насыщенная шина для стрелкового оружия. */
  gun?: boolean;
}

interface ToneOptions {
  wave?: Wave;
  to?: number;
  detune?: number;
  attack?: number;
  filter?: { from: number; to?: number; q?: number };
  gun?: boolean;
}

const MASTER_VOLUME = 0.58;

export type MusicScene = 'menu' | 'explore' | 'city' | 'boss' | 'none';

type WeaponFamily = 'arcane' | 'steel' | 'gun' | 'heavy' | 'flesh' | 'bone';
type GunMode = 'pistol' | 'revolver' | 'smg' | 'rifle' | 'shotgun' | 'sniper' | 'launcher';

interface WeaponVoice {
  family: WeaponFamily;
  mode: GunMode;
  /** Каждый ID сохраняет свой тембр, поэтому все стволы звучат по-разному. */
  pitch: number;
  brightness: number;
  body: number;
  signature: number;
  tier: number;
  rank: number;
  /** Длина хвоста и эха выстрела. */
  tail: number;
  /** Количество грязного шума в атаке. */
  grit: number;
  /** Индивидуальный тембровый оттенок из ID (0..1). */
  accent: number;
  /** Сдвиг фазы для хвостов и дополнительных слоёв (0..1). */
  phase: number;
  metal: boolean;
  undead: boolean;
}

/** Дополнительная информация о выстреле: источник радиуса действия. */
export interface ShootOptions {
  source?: 'weapon' | 'dash' | 'ability';
  aoe?: number;
}

const CLASS_FAMILY: Record<string, WeaponFamily> = {
  mage: 'arcane',
  ninja: 'steel',
  soldier: 'gun',
  bandit: 'gun',
  demolisher: 'heavy',
  boxer: 'flesh',
  vampire: 'flesh',
  vampire_prime: 'flesh',
  executioner: 'heavy',
  necromancer: 'bone',
};

function hashId(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function classOfWeapon(weaponId: string): string {
  if (weaponId.startsWith('vampire_prime')) return 'vampire_prime';
  return weaponId.split('_')[0] ?? '';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Минимальные паузы между одинаковыми звуками, чтобы не превратить всё в кашу. */
const SHOOT_GAPS: Record<WeaponKind, number> = {
  bolt: 0.05,
  spread: 0.09,
  burst: 0.07,
  orb: 0.11,
  melee: 0.1,
  nova: 0.18,
  explosive: 0.13,
  flame: 0.09,
  mine: 0.14,
};

/** Процедурный звук: никаких внешних mp3, всё генерируется через WebAudio. */
export class Sound {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private gunBus: GainNode | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private brownBuffer: AudioBuffer | null = null;
  private readonly lastPlayed = new Map<string, number>();

  private musicEnabled = true;
  private musicVolume = 0.7;
  private masterVolume = 1;
  private musicScene: MusicScene = 'none';
  private musicTimer = 0;
  private musicNext = 0;
  private musicStep = 0;

  muted = false;

  /** Итоговый master-gain: общий ползунок уменьшает вообще все звуки и музыку. */
  private masterGainValue(): number {
    return this.muted ? 0 : MASTER_VOLUME * this.masterVolume;
  }

  /** Общая громкость игры. Влияет на выстрелы, шаги, музыку и UI-звуки. */
  setMasterVolume(value: number): void {
    const numeric = Number(value);
    this.masterVolume = Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric)) : 1;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.masterGainValue(), this.ctx.currentTime, 0.02);
    }
  }

  unlock(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;
    const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) return null;
    try {
      const ctx = new Constructor();

      // Общий микшер: мягкий сатуратор перед компрессором даёт громкость без клиппинга.
      const master = ctx.createGain();
      master.gain.value = this.masterGainValue();
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.makeDriveCurve() as Float32Array<ArrayBuffer>;
      shaper.oversample = '2x';
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -9;
      limiter.knee.value = 6;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.14;
      master.connect(shaper).connect(limiter).connect(ctx.destination);

      const bus = ctx.createGain();
      bus.connect(master);

      // Музыка идёт отдельной шиной и получает общий реверб, не забивая выстрелы.
      const musicBus = ctx.createGain();
      musicBus.gain.value = this.musicEnabled ? 0.62 * this.musicVolume : 0;
      musicBus.connect(bus);

      // Отдельная шина для стрельбы: насыщение + собственный компрессор + эхо.
      const gunBus = ctx.createGain();
      const gunComp = ctx.createDynamicsCompressor();
      gunComp.threshold.value = -13;
      gunComp.knee.value = 8;
      gunComp.ratio.value = 9;
      gunComp.attack.value = 0.001;
      gunComp.release.value = 0.1;
      gunBus.connect(gunComp).connect(master);

      const echoDelay = ctx.createDelay(0.5);
      echoDelay.delayTime.value = 0.105;
      const echoFilter = ctx.createBiquadFilter();
      echoFilter.type = 'lowpass';
      echoFilter.frequency.value = 2600;
      const echoGain = ctx.createGain();
      echoGain.gain.value = 0.13;
      gunComp.connect(echoDelay).connect(echoFilter).connect(echoGain).connect(master);

      const echo2Delay = ctx.createDelay(0.5);
      echo2Delay.delayTime.value = 0.235;
      const echo2Filter = ctx.createBiquadFilter();
      echo2Filter.type = 'lowpass';
      echo2Filter.frequency.value = 1700;
      const echo2Gain = ctx.createGain();
      echo2Gain.gain.value = 0.065;
      gunComp.connect(echo2Delay).connect(echo2Filter).connect(echo2Gain).connect(master);

      // Тёмное помещение: затухающий сглаженный шум, без внешних файлов.
      const convolver = ctx.createConvolver();
      convolver.buffer = this.makeImpulse(ctx);
      const wet = ctx.createGain();
      wet.gain.value = 0.19;
      bus.connect(convolver);
      gunComp.connect(convolver);
      convolver.connect(wet).connect(master);

      const length = Math.floor(ctx.sampleRate * 2);
      const white = ctx.createBuffer(1, length, ctx.sampleRate);
      const whiteData = white.getChannelData(0);
      for (let i = 0; i < length; i += 1) whiteData[i] = Math.random() * 2 - 1;

      const brown = ctx.createBuffer(1, length, ctx.sampleRate);
      const brownData = brown.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < length; i += 1) {
        previous = (previous + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        brownData[i] = previous * 3.4;
      }

      this.ctx = ctx;
      this.bus = bus;
      this.gunBus = gunBus;
      this.master = master;
      this.musicBus = musicBus;
      this.noiseBuffer = white;
      this.brownBuffer = brown;
    } catch {
      this.ctx = null;
      this.bus = null;
      this.gunBus = null;
      this.master = null;
      this.musicBus = null;
      this.noiseBuffer = null;
      this.brownBuffer = null;
    }
    return this.ctx;
  }

  /** Мягкое насыщение: уплотняет транзиенты и поднимает громкость без срезания пиков. */
  private makeDriveCurve(): Float32Array {
    const curve = new Float32Array(1024);
    const norm = Math.tanh(1.45);
    for (let i = 0; i < curve.length; i += 1) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 1.45) / norm;
    }
    return curve;
  }

  /** Импульсная характеристика маленького помещения: затухающий сглаженный шум. */
  private makeImpulse(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.6);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      let previous = 0;
      for (let i = 0; i < length; i += 1) {
        const decay = Math.pow(1 - i / length, 2.8);
        previous = previous * 0.55 + (Math.random() * 2 - 1) * 0.45;
        data[i] = previous * decay;
      }
    }
    return buffer;
  }

  /** Время запуска либо null, если звук выключен, контекст не работает или уже был недавно. */
  private ready(key: string, minGap: number): number | null {
    const ctx = this.ensure();
    if (!ctx) return null;
    if (this.master) this.master.gain.value = this.masterGainValue();
    if (this.muted || ctx.state !== 'running') return null;
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(key);
    if (last !== undefined && now - last < minGap) return null;
    this.lastPlayed.set(key, now);
    return now;
  }

  private connect(node: AudioNode, gun = false): void {
    if (gun && this.gunBus) node.connect(this.gunBus);
    else if (this.bus) node.connect(this.bus);
  }

  /** Шумовой слой с фильтром, субмиллисекундной атакой и опциональным дрожанием частоты. */
  private noise(time: number, duration: number, volume: number, options: NoiseOptions): void {
    const ctx = this.ctx;
    const buffer = options.color === 'brown' ? this.brownBuffer : this.noiseBuffer;
    if (!ctx || !buffer || !this.bus) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = options.type ?? 'lowpass';
    filter.Q.value = options.q ?? 0.8;
    const from = Math.max(20, options.from);
    const to = Math.max(20, options.to ?? from);
    filter.frequency.setValueAtTime(from, time);
    filter.frequency.exponentialRampToValueAtTime(to, time + duration);
    const envelope = ctx.createGain();
    const attack = clamp(options.attack ?? 0.004, 0.0002, duration * 0.5);
    envelope.gain.setValueAtTime(0.0001, time);
    if (attack <= 0.0006) envelope.gain.setValueAtTime(Math.max(0.0002, volume), time + 0.0002);
    else envelope.gain.linearRampToValueAtTime(Math.max(0.0002, volume), time + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter).connect(envelope);
    this.connect(envelope, options.gun);
    if (options.wobble) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = options.wobble.rate;
      depth.gain.value = options.wobble.depth;
      lfo.connect(depth).connect(filter.frequency);
      lfo.start(time);
      lfo.stop(time + duration + 0.01);
    }
    const maxOffset = Math.max(0, buffer.duration - duration - 0.02);
    source.start(time, Math.random() * maxOffset, duration);
  }

  /** Тональное тело с изменением высоты, лёгким расстроем и опциональным фильтром. */
  private tone(time: number, duration: number, volume: number, freq: number, options: ToneOptions = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;
    const osc = ctx.createOscillator();
    osc.type = options.wave ?? 'sine';
    osc.detune.value = options.detune ?? 0;
    osc.frequency.setValueAtTime(Math.max(20, freq), time);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.to ?? freq), time + duration);
    const envelope = ctx.createGain();
    const attack = clamp(options.attack ?? 0.006, 0.0002, duration * 0.5);
    envelope.gain.setValueAtTime(0.0001, time);
    if (attack <= 0.0006) envelope.gain.setValueAtTime(Math.max(0.0002, volume), time + 0.0002);
    else envelope.gain.linearRampToValueAtTime(Math.max(0.0002, volume), time + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    let tail: AudioNode = osc;
    if (options.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = options.filter.q ?? 1;
      filter.frequency.setValueAtTime(options.filter.from, time);
      filter.frequency.exponentialRampToValueAtTime(options.filter.to ?? options.filter.from, time + duration);
      osc.connect(filter);
      tail = filter;
    }
    tail.connect(envelope);
    this.connect(envelope, options.gun);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  /** Ударный фронт: широкий спектр, субмиллисекундная атака и резкий спад. */
  private transient(time: number, volume: number, pitch: number, gun = false): void {
    this.noise(time, 0.014, volume, {
      type: 'highpass', from: 2600 * pitch, to: 1050 * pitch, attack: 0.0002, gun,
    });
    this.noise(time, 0.04, volume * 0.55, {
      type: 'bandpass', q: 0.75, from: 5800 * pitch, to: 1600 * pitch, attack: 0.0002, gun,
    });
    this.tone(time, 0.02, volume * 0.32, 1500 * pitch, {
      wave: 'triangle', to: 600 * pitch, attack: 0.0002, gun,
    });
  }

  /** Тяжёлое low-end тело: расширение пороховых газов и удар по воздуху. */
  private thump(time: number, volume: number, pitch: number, duration: number, gun = false): void {
    this.tone(time, duration, volume, 165 * pitch, {
      wave: 'sine', to: 40 * pitch, attack: 0.0008, gun,
    });
    this.tone(time, duration * 0.7, volume * 0.45, 96 * pitch, {
      wave: 'triangle', to: 34 * pitch, attack: 0.001,
      filter: { from: 650 * pitch, to: 110 * pitch }, gun,
    });
    this.noise(time, duration * 0.85, volume * 0.6, {
      color: 'brown', type: 'lowpass', from: 800 * pitch, to: 80 * pitch, attack: 0.0006, gun,
    });
  }

  /** Пороховой хлопок: сначала ударная волна, затем спокойный спад. */
  private crack(time: number, volume: number, pitch: number, bright: number, gun = true): void {
    this.noise(time, 0.016, volume, {
      type: 'highpass', from: 1800 * pitch * bright, to: 1000 * pitch, attack: 0.0002, gun,
    });
    this.noise(time, 0.055, volume * 0.6, {
      type: 'bandpass', q: 0.7, from: 6000 * pitch * bright, to: 1500 * pitch, attack: 0.0002, gun,
    });
    this.tone(time, 0.022, volume * 0.35, 1900 * pitch * bright, {
      wave: 'triangle', to: 650 * pitch, attack: 0.0002, gun,
    });
  }

  /** Баллистика: свист снаряда переходит в сухой треск и уходит в эхо. */
  private whip(time: number, volume: number, pitch: number, bright: number, duration: number, gun = true): void {
    this.noise(time, duration, volume, {
      type: 'bandpass', q: 0.55, from: 4600 * pitch * bright, to: 680 * pitch, attack: 0.0008, gun,
    });
    this.noise(time + 0.008, duration * 0.65, volume * 0.4, {
      type: 'highpass', from: 6800 * pitch * bright, to: 2400 * pitch, attack: 0.001, gun,
    });
  }

  /** Щелчок спуска, затвора или выбрасывателя. */
  private mechanism(time: number, volume: number, pitch: number, gun = false): void {
    this.noise(time, 0.012, volume, {
      type: 'bandpass', q: 1.8, from: 3600 * pitch, to: 1200 * pitch, attack: 0.0002, gun,
    });
    this.tone(time, 0.014, volume * 0.4, 1250 * pitch, {
      wave: 'square', to: 520 * pitch, attack: 0.0002,
      filter: { from: 4200 * pitch, to: 1400 * pitch }, gun,
    });
  }

  /** Звон гильзы, упавшей на камень. */
  private ping(time: number, volume: number, pitch: number): void {
    this.tone(time, 0.13, volume, 2400 * pitch, {
      wave: 'sine', to: 1880 * pitch, attack: 0.0004, gun: true,
    });
    this.noise(time, 0.05, volume * 0.5, {
      type: 'bandpass', q: 3.5, from: 5200 * pitch, to: 2600 * pitch, attack: 0.0002, gun: true,
    });
  }

  /** Дребезг: гильзы, дробь, кости или цепи. */
  private rattle(time: number, duration: number, volume: number, pitch: number, gun = false, seed = 0.5): void {
    for (let i = 0; i < 4; i += 1) {
      const at = time + duration * (0.08 + i * 0.22 + seed * 0.05);
      this.noise(at, 0.018, volume * (1 - i * 0.14), {
        type: 'bandpass', q: 2.2,
        from: (2800 + i * 650) * pitch, to: (900 + i * 220) * pitch,
        attack: 0.0003, gun,
      });
    }
  }

  /** Отражения от стен и скалов — длинный хвост снайперского выстрела. */
  private echo(time: number, volume: number, pitch: number, tail: number, gun = true): void {
    for (let i = 0; i < 2; i += 1) {
      this.noise(time + (0.11 + i * 0.12) * tail, 0.16 - i * 0.04, volume * (1 - i * 0.45), {
        type: 'bandpass', q: 0.7,
        from: (1700 - i * 500) * pitch, to: (380 - i * 100) * pitch,
        attack: 0.004, gun,
      });
    }
  }

  /** Потрескивание осколков и искр. */
  private crackle(time: number, duration: number, volume: number): void {
    const count = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i += 1) {
      const at = time + duration * (0.15 + Math.random() * 0.85);
      this.noise(at, 0.012 + Math.random() * 0.02, volume * (0.5 + Math.random() * 0.5), {
        type: 'bandpass', q: 1.2,
        from: 900 + Math.random() * 2600, to: 500 + Math.random() * 1400,
        attack: 0.0003,
      });
    }
  }

  /** Низкий спад + широкий шумовой взрыв + потрескивание осколков. */
  private blast(time: number, volume: number, pitch: number, scale: number): void {
    this.thump(time, 0.32 * volume, pitch * 0.85, 0.42 * scale);
    this.noise(time, 0.34 * scale, 0.3 * volume, {
      type: 'lowpass', from: 2600 * pitch, to: 150 * pitch, attack: 0.0008,
    });
    this.noise(time, 0.18 * scale, 0.12 * volume, {
      type: 'bandpass', q: 0.6, from: 1200 * pitch, to: 260 * pitch, attack: 0.0005,
    });
    this.noise(time + 0.02, 0.3 * scale, 0.1 * volume, {
      color: 'brown', type: 'lowpass', from: 700 * pitch, to: 80 * pitch,
    });
    this.crackle(time + 0.03, 0.32 * scale, 0.07 * volume);
  }

  /** Перезвон расстроенных обертонов: сфера, магия и ударные волны. */
  private shimmer(time: number, volume: number, pitch: number, voice: WeaponVoice, gun = false): void {
    const spread = 8 + voice.accent * 34;
    this.tone(time, 0.24 * voice.tail, 0.03 * volume, (1450 + voice.accent * 900) * pitch, {
      wave: 'sine', to: (2100 + voice.phase * 700) * pitch, detune: spread, attack: 0.008, gun,
    });
    this.tone(time + 0.01, 0.19 * voice.tail, 0.022 * volume, (2350 + voice.phase * 800) * pitch, {
      wave: 'triangle', to: (1750 + voice.accent * 600) * pitch, detune: -spread, attack: 0.01, gun,
    });
    this.noise(time + 0.004, 0.16 * voice.tail, 0.02 * volume, {
      type: 'bandpass', q: 4.5,
      from: (3200 + voice.accent * 2200) * pitch,
      to: (1800 + voice.phase * 1400) * pitch,
      attack: 0.006, gun,
    });
  }

  /** Поджог фитиля: свист и щелчок перед взрывом. */
  private fuse(time: number, volume: number, pitch: number, voice: WeaponVoice, gun = false): void {
    this.noise(time, 0.09, 0.035 * volume, {
      type: 'bandpass', q: 1.4,
      from: (900 + voice.accent * 700) * pitch,
      to: (2800 + voice.phase * 1400) * pitch,
      attack: 0.004, gun,
    });
    this.mechanism(time + 0.07, 0.035 * volume, 1.15 * pitch, gun);
  }

  /** Зарядка: короткий восходящий тон перед выстрелом сферы или волны. */
  private charge(time: number, volume: number, pitch: number, voice: WeaponVoice, gun = false): void {
    this.tone(time, 0.075, 0.03 * volume, (240 + voice.accent * 160) * pitch, {
      wave: 'triangle', to: (900 + voice.phase * 700) * pitch,
      filter: { from: 500 * pitch, to: 3200 * pitch, q: 0.9 }, attack: 0.006, gun,
    });
    this.noise(time + 0.01, 0.055, 0.02 * volume, {
      type: 'bandpass', q: 2.2,
      from: (1200 + voice.accent * 800) * pitch,
      to: (3600 + voice.phase * 900) * pitch,
      attack: 0.004, gun,
    });
  }

  /** Огнемёт: turbulence, низкий гул и редкие всплески пламени. */
  private flameVoice(time: number, volume: number, pitch: number, voice?: WeaponVoice): void {
    const tail = voice?.tail ?? 1;
    const grit = voice?.grit ?? 1;
    const accent = voice?.accent ?? 0.5;
    this.noise(time, 0.44 * tail, 0.15 * volume, {
      type: 'bandpass', q: 0.75,
      from: (560 + accent * 180) * pitch, to: (760 + accent * 340) * pitch, attack: 0.025,
      wobble: { rate: 9 + accent * 9 + Math.random() * 3, depth: (180 + accent * 200) * pitch },
    });
    this.noise(time, 0.36 * tail, 0.1 * volume, {
      type: 'lowpass', from: (1200 + accent * 700) * pitch, to: (260 + accent * 160) * pitch, attack: 0.02,
      wobble: { rate: 5 + accent * 5, depth: (130 + accent * 130) * pitch },
    });
    this.noise(time + 0.01, 0.4 * tail, 0.07 * volume * grit, {
      color: 'brown', type: 'lowpass', from: 420 * pitch, to: 110 * pitch, attack: 0.02,
    });
    this.tone(time, 0.3, 0.04 * volume, 95 * pitch, {
      wave: 'sine', to: 58 * pitch, attack: 0.04,
    });
    this.transient(time, 0.05 * volume, 0.8 * pitch);
    this.crackle(time + 0.04, 0.36 * tail, 0.03 * volume);
  }

  /** Магия: тёмный удар, расстроенные тона и шиммер, уходящий в помещение. */
  private magic(time: number, volume: number, pitch: number, wide: boolean, voice?: WeaponVoice): void {
    const tail = voice?.tail ?? 1;
    const bright = voice?.brightness ?? 1;
    const signature = voice?.signature ?? 0.5;
    this.thump(time, 0.13 * volume, pitch * 0.9, 0.18 * tail);
    this.noise(time, 0.07 * tail, 0.13 * volume, {
      type: 'bandpass', q: 1.1, from: 2800 * pitch * bright, to: 900 * pitch, attack: 0.0006,
    });
    this.tone(time, 0.28 * tail, 0.07 * volume, 240 * pitch, {
      wave: 'triangle', to: 620 * pitch, attack: 0.004,
      filter: { from: 900 * pitch, to: 2600 * pitch, q: 0.8 },
    });
    this.tone(time + 0.01, 0.24 * tail, 0.05 * volume, 370 * pitch, {
      wave: 'sine', to: 940 * pitch, detune: 11, attack: 0.006,
    });
    this.noise(time + 0.02, (wide ? 0.42 : 0.3) * tail, 0.06 * volume, {
      type: 'bandpass', q: 0.8, from: 1600 * pitch * bright, to: 5200 * pitch * bright, attack: 0.03,
    });
    this.tone(time + 0.05, 0.3 * tail, 0.028 * volume, (1150 + signature * 700) * pitch, {
      wave: 'sine', to: (1750 + signature * 800) * pitch, detune: -8, attack: 0.02,
    });
    if (wide) this.echo(time + 0.06, 0.05 * volume, pitch, tail, false);
  }

  /** Клинок: свист стали, тяжёлый вход и тонкий звон, для нежити — влажный дребезг. */
  private steelVoice(time: number, volume: number, pitch: number, voice: WeaponVoice, impact = true): void {
    const tail = voice.tail;
    this.noise(time, 0.09, 0.11 * volume, {
      type: 'bandpass', q: 0.65, from: 850 * pitch, to: 3600 * pitch, attack: 0.012,
    });
    const ring = time + (impact ? 0.05 : 0.01);
    if (impact) {
      this.noise(ring, 0.14, 0.14 * volume, {
        type: 'lowpass', from: 2400 * pitch, to: 220 * pitch, attack: 0.0008,
      });
      this.thump(ring, 0.1 * volume, pitch * 0.9, 0.1);
      this.mechanism(ring, 0.06 * volume, 1.2 * pitch);
    }
    this.tone(ring, 0.44 * tail, 0.055 * volume, 2150 * pitch, {
      wave: 'sine', to: 1980 * pitch, attack: 0.001,
    });
    this.tone(ring + 0.002, 0.32 * tail, 0.03 * volume, 3280 * pitch, {
      wave: 'sine', to: 3050 * pitch, detune: 7, attack: 0.001,
    });
    this.noise(ring, 0.2 * tail, 0.04 * volume, {
      type: 'bandpass', q: 3.2, from: 4600 * pitch, to: 2400 * pitch, attack: 0.001,
    });
    if (voice.undead) this.rattle(ring + 0.02, 0.2 * tail, 0.05 * volume, 0.95 * pitch, false, voice.signature);
  }

  /** Нежить: мокрый удар, сухой шорох и костяной дребезг. */
  private undeadVoice(time: number, volume: number, pitch: number, voice: WeaponVoice): void {
    const tail = voice.tail;
    this.noise(time, 0.1, 0.16 * volume, {
      type: 'lowpass', from: 1400 * pitch, to: 180 * pitch, attack: 0.001,
    });
    this.thump(time, 0.13 * volume, pitch * 0.9, 0.16);
    this.rattle(time + 0.012, 0.2 * tail, 0.06 * volume, 1.15 * pitch, false, voice.signature);
    this.noise(time + 0.02, 0.24 * tail, 0.05 * volume, {
      type: 'bandpass', q: 0.7, from: 2600 * pitch, to: 700 * pitch, attack: 0.004,
    });
  }

  /** Плоть: плотный влажный удар без металлического звона. */
  private fleshVoice(time: number, volume: number, pitch: number, voice: WeaponVoice): void {
    this.noise(time, 0.07, 0.15 * volume, {
      type: 'lowpass', from: 1000 * pitch, to: 160 * pitch, attack: 0.001,
    });
    this.thump(time, 0.17 * volume, pitch * 0.85, 0.12);
    this.noise(time + 0.01, 0.16 * voice.tail, 0.05 * volume, {
      type: 'bandpass', q: 0.8, from: 1800 * pitch, to: 420 * pitch, attack: 0.003,
    });
    if (voice.undead) this.rattle(time + 0.02, 0.16, 0.045 * volume, 1.1 * pitch, false, voice.signature);
  }

  /** Тяжёлое оружие: глупый удар, земляной гул и металлический призвук. */
  private heavyVoice(time: number, volume: number, pitch: number, voice: WeaponVoice): void {
    const tail = voice.tail;
    this.thump(time, 0.32 * volume, pitch * 0.8, 0.24 * tail);
    this.noise(time, 0.2, 0.22 * volume, {
      type: 'lowpass', from: 1800 * pitch, to: 120 * pitch, attack: 0.0008,
    });
    this.noise(time + 0.01, 0.3 * tail, 0.09 * volume, {
      color: 'brown', type: 'lowpass', from: 500 * pitch, to: 70 * pitch,
    });
    this.mechanism(time, 0.06 * volume, 0.8 * pitch);
    if (voice.metal) {
      this.tone(time + 0.01, 0.3 * tail, 0.04 * volume, 1750 * pitch, {
        wave: 'sine', to: 1600 * pitch, attack: 0.001,
      });
      this.noise(time + 0.01, 0.16 * tail, 0.035 * volume, {
        type: 'bandpass', q: 3, from: 3900 * pitch, to: 2000 * pitch, attack: 0.001,
      });
    }
  }

  /** Удар в ближнем бою: характер зависит от семьи оружия. */
  private meleeVoice(time: number, volume: number, pitch: number, voice: WeaponVoice): void {
    switch (voice.family) {
      case 'steel':
        this.steelVoice(time, volume, pitch, voice);
        break;
      case 'bone':
        this.undeadVoice(time, volume, pitch, voice);
        break;
      case 'heavy':
        this.heavyVoice(time, volume, pitch, voice);
        break;
      case 'flesh':
        if (voice.undead) this.undeadVoice(time, volume, pitch, voice);
        else if (voice.metal) this.heavyVoice(time, volume, pitch, voice);
        else this.fleshVoice(time, volume, pitch, voice);
        break;
      default:
        // Приклад/рукоять огнестрела: короткий удар металлом о плоть.
        this.mechanism(time, 0.1 * volume, pitch * 0.9, true);
        this.thump(time + 0.004, 0.15 * volume, pitch * 0.8, 0.12, true);
        this.noise(time, 0.08, 0.06 * volume, {
          type: 'bandpass', q: 0.9, from: 1700 * pitch, to: 400 * pitch, attack: 0.001, gun: true,
        });
        break;
    }
  }

  /** Гранатомёт/ракетница: сухой выстрел, свист полёта и тяжёлый низкий хлопок. */
  private launcherVoice(time: number, volume: number, pitch: number, voice: WeaponVoice, scale = 1): void {
    const tail = voice.tail;
    this.mechanism(time, 0.07 * volume, pitch * 0.8, true);
    const shot = time + 0.01;
    this.noise(shot, 0.14, 0.17 * volume, {
      type: 'bandpass', q: 0.5, from: 1100 * pitch, to: 260 * pitch, attack: 0.0005, gun: true,
    });
    this.noise(shot + 0.015, 0.3 * tail, 0.1 * volume, {
      type: 'highpass', from: 400 * pitch, to: 2200 * pitch, attack: 0.01, gun: true,
    });
    this.thump(shot + 0.09, 0.28 * volume, pitch * 0.8, 0.3 * scale, true);
    this.noise(shot + 0.09, 0.26 * scale, 0.17 * volume, {
      type: 'lowpass', from: 2200 * pitch, to: 140 * pitch, attack: 0.001, gun: true,
    });
    this.crackle(shot + 0.11, 0.24 * scale, 0.05 * volume);
    this.mechanism(shot + 0.16 * tail, 0.05 * volume, 0.9 * pitch, true);
  }

  /** Выстрел: ударная волна, тело ствола, баллистический хвост и механика. */
  private firearmVoice(time: number, volume: number, pitch: number, voice: WeaponVoice): void {
    const mode = voice.mode;
    if (mode === 'launcher') {
      this.launcherVoice(time, volume, pitch, voice);
      return;
    }
    const bright = voice.brightness;
    const tail = voice.tail;
    this.mechanism(time, 0.05 * volume, pitch * 0.95, true);
    const t = time + 0.007;

    const profile = {
      pistol: { crack: 0.3, body: 0.19, thump: 0.1, whip: 0.09 },
      revolver: { crack: 0.35, body: 0.25, thump: 0.15, whip: 0.14 },
      smg: { crack: 0.25, body: 0.14, thump: 0.07, whip: 0.06 },
      rifle: { crack: 0.32, body: 0.21, thump: 0.11, whip: 0.1 },
      shotgun: { crack: 0.42, body: 0.34, thump: 0.24, whip: 0.2 },
      sniper: { crack: 0.44, body: 0.26, thump: 0.17, whip: 0.24 },
      launcher: { crack: 0.13, body: 0.22, thump: 0.22, whip: 0.14 },
    }[mode];
    const crackVol = profile.crack * volume * (0.9 + voice.grit * 0.15);
    const bodyVol = profile.body * volume;
    this.crack(t, crackVol, pitch, bright, true);
    this.thump(t, bodyVol, pitch * (mode === 'shotgun' ? 0.78 : mode === 'sniper' ? 0.88 : 1),
      profile.thump * (0.9 + tail * 0.15), true);
    this.whip(t + 0.003, crackVol * 0.28, pitch, bright, profile.whip * tail, true);
    this.noise(t, 0.06 * tail, 0.05 * volume * voice.grit, {
      type: 'bandpass', q: 0.6, from: 2400 * pitch * bright, to: 600 * pitch,
      attack: 0.0006, gun: true,
    });

    switch (mode) {
      case 'pistol':
        this.mechanism(t + 0.075 * tail, 0.09 * volume, 1.1 * pitch, true);
        this.ping(t + 0.11 * tail, 0.03 * volume, 1.4 * pitch);
        break;
      case 'revolver':
        // Тяжёлый молоток до выстрела и лязг барабана после.
        this.tone(time, 0.03, 0.12 * volume, 780 * pitch, {
          wave: 'square', to: 260 * pitch, attack: 0.0002,
          filter: { from: 2600 * pitch, to: 700 * pitch }, gun: true,
        });
        this.rattle(t + 0.055, 0.1 * tail, 0.055 * volume, 1.05 * pitch, true, voice.signature);
        this.tone(t + 0.02, 0.34 * tail, 0.035 * volume, 2050 * pitch, {
          wave: 'sine', to: 1900 * pitch, attack: 0.001, gun: true,
        });
        break;
      case 'smg':
        this.mechanism(t + 0.032, 0.08 * volume, 1.3 * pitch, true);
        this.noise(t + 0.036, 0.04, 0.04 * volume, {
          type: 'highpass', from: 4200 * pitch, to: 1800 * pitch, attack: 0.0004, gun: true,
        });
        break;
      case 'rifle':
        this.mechanism(t + 0.05, 0.1 * volume, 1.2 * pitch, true);
        this.mechanism(t + 0.075, 0.06 * volume, 0.9 * pitch, true);
        this.ping(t + 0.105 * tail, 0.05 * volume, 1.35 * pitch);
        break;
      case 'shotgun':
        this.noise(t, 0.32 * tail, 0.26 * volume, {
          type: 'lowpass', from: 3400 * pitch * bright, to: 130 * pitch, attack: 0.0005, gun: true,
        });
        this.noise(t + 0.02, 0.28 * tail, 0.11 * volume, {
          color: 'brown', type: 'lowpass', from: 700 * pitch, to: 70 * pitch, attack: 0.002, gun: true,
        });
        this.rattle(t + 0.08, 0.2 * tail, 0.07 * volume, 0.95 * pitch, true, voice.signature);
        this.ping(t + 0.13 * tail, 0.045 * volume, 1.1 * pitch);
        break;
      case 'sniper':
        this.crack(t + 0.012, crackVol * 0.35, pitch * 1.05, bright * 1.1, true);
        this.echo(t + 0.08, 0.1 * volume, pitch, tail, true);
        this.tone(t + 0.02, 0.4 * tail, 0.028 * volume, 2300 * pitch, {
          wave: 'sine', to: 2150 * pitch, attack: 0.001, gun: true,
        });
        this.mechanism(t + 0.15 * tail, 0.08 * volume, 0.85 * pitch, true);
        this.ping(t + 0.2 * tail, 0.035 * volume, 1.2 * pitch);
        break;
    }
  }

  /** Детерминированный «голос» оружия: ID задаёт тембр и подкласс, класс — характер. */
  private weaponVoice(kind: WeaponKind, weaponId?: string): WeaponVoice {
    if (!weaponId) {
      return {
        family: 'gun', mode: 'rifle', pitch: 1, brightness: 1, body: 1,
        signature: 0.5, tier: 0, rank: 0, tail: 1, grit: 1, accent: 0.5, phase: 0.5,
        metal: false, undead: false,
      };
    }
    const id = weaponId.toLowerCase();
    const hash = hashId(id);
    const cls = classOfWeapon(id);
    let family = CLASS_FAMILY[cls] ?? 'gun';
    const undead = /vampire|necro|bone|skull|grave|undead|zombie/.test(id);
    const metal = /hammer|axe|chain|blade|steel|metal|shuriken|scythe|katana|kunai|knife|dart/.test(id);

    // Явные имена важнее класса: коса вампира — сталь, посох некроманта — кость.
    if (/katana|kunai|shuriken|knife|axe|scythe|blade|steel|spear|dagger/.test(id)) family = 'steel';
    else if (/shotgun|revolver|rifle|sniper|derringer|pistol|bullet|smg|submachine|dart/.test(id)) family = 'gun';
    else if (/dynamite|grenade|rocket|mine|nuke|bomb|molotov|flamer|hammer/.test(id)) family = 'heavy';
    else if (/bone|skull|grave|necro/.test(id)) family = 'bone';
    else if (/fist|fang|bite|blood|wave|chains/.test(id)) family = 'flesh';
    else if (/grimoire|orb|nova|spark|frost|mirror|soul|comet|crystal|staff|magic|arcane/.test(id)) family = 'arcane';
    if ((cls === 'soldier' || cls === 'bandit') && /grenade|rocket/.test(id)) family = 'gun';

    // У сгенерированных оружий ID вида soldier_arc57 не несёт смысла,
    // поэтому подкласс выводится из типа атаки и битов хэша.
    const arc = /_arc(\d+)$/.exec(id);
    if (arc && kind === 'melee' && family === 'gun') family = 'steel';
    const index = arc ? Math.max(0, Number(arc[1]) - 1) : hash % 40;
    const tier = index % 4;
    const rank = Math.min(9, Math.floor(index / 4));
    // Перемешиваем хэш, чтобы каждый срез давал полные 10 бит (иначе старшие
    // сдвиги почти не меняются и 1028 стволов звучали бы одинаково).
    const frac = (shift: number): number => {
      let v = Math.imul(hash ^ Math.imul(shift + 1, 0x9e3779b9), 0x85ebca6b);
      v ^= v >>> 13;
      v = Math.imul(v, 0xc2b2ae35);
      v ^= v >>> 16;
      return ((v >>> (shift % 22)) & 1023) / 1023;
    };

    let mode: GunMode;
    if (!arc) {
      if (/shotgun|double|scatter/.test(id) || kind === 'spread') mode = 'shotgun';
      else if (/grenade|rocket|launcher|mine/.test(id) || kind === 'explosive') mode = 'launcher';
      else if (/sniper|marksman/.test(id)) mode = 'sniper';
      else if (/revolver|derringer/.test(id)) mode = 'revolver';
      else if (/smg|submachine/.test(id)) mode = 'smg';
      else if (/pistol/.test(id)) mode = 'pistol';
      else mode = 'rifle';
    } else if (kind === 'spread') mode = 'shotgun';
    else if (kind === 'explosive') mode = 'launcher';
    else if (kind === 'burst') mode = (hash & 1) === 1 ? 'smg' : 'rifle';
    else if (kind === 'bolt') {
      const sidearms: GunMode[] = ['pistol', 'revolver', 'smg', 'rifle', 'shotgun', 'sniper'];
      mode = sidearms[(hash >>> 4) % sidearms.length];
    } else mode = 'rifle';

    return {
      family,
      mode,
      pitch: clamp(0.84 + frac(0) * 0.4 + tier * 0.02 - rank * 0.005, 0.8, 1.3),
      brightness: clamp(0.78 + frac(9) * 0.55 + tier * 0.035, 0.74, 1.5),
      body: clamp(0.88 + frac(17) * 0.3 + rank * 0.012, 0.84, 1.32),
      signature: frac(25),
      tier,
      rank,
      tail: clamp(0.88 + frac(29) * 0.42 + tier * 0.05, 0.85, 1.5),
      grit: 0.75 + frac(21) * 0.6,
      accent: frac(33),
      phase: frac(37),
      metal,
      undead,
    };
  }

  /** Тонкий индивидуальный штрих, по которому один ствол отличается от соседнего. */
  private weaponSignature(voice: WeaponVoice, time: number, volume: number, pitch: number): void {
    const at = time + 0.006 + voice.signature * 0.02;
    const bright = voice.brightness;
    const gun = voice.family === 'gun';
    switch (voice.family) {
      case 'gun':
        this.noise(at, 0.028, 0.025 * volume, {
          type: 'bandpass', q: 2.4,
          from: (2600 + voice.signature * 2600) * pitch * bright,
          to: (1100 + voice.signature * 800) * pitch,
          attack: 0.0003, gun: true,
        });
        break;
      case 'steel':
        this.tone(at + 0.01, 0.26 * voice.tail, 0.02 * volume, (2600 + voice.signature * 1200) * pitch, {
          wave: 'sine', to: (2350 + voice.signature * 1000) * pitch, attack: 0.001,
        });
        break;
      case 'arcane':
        this.tone(at, 0.22 * voice.tail, 0.02 * volume, (1100 + voice.signature * 700) * pitch, {
          wave: 'sine', to: (1900 + voice.signature * 800) * pitch, detune: 6, attack: 0.01,
        });
        break;
      case 'bone':
        this.noise(at + 0.02, 0.02, 0.03 * volume, {
          type: 'bandpass', q: 2.6,
          from: (2200 + voice.signature * 1800) * pitch, to: 800 * pitch, attack: 0.0003,
        });
        break;
      case 'flesh':
        this.noise(at, 0.06, 0.03 * volume, {
          type: 'lowpass', from: 800 * pitch, to: 180 * pitch, attack: 0.001,
        });
        break;
      case 'heavy':
        this.tone(at, 0.14, 0.04 * volume, 110 * pitch, {
          wave: 'triangle', to: 42 * pitch, attack: 0.001, gun,
        });
        break;
    }
  }

  /** Выстрел конкретного оружия: тип задаёт основу, ID — неповторимый тембр и баллистику. */
  shoot(kind: WeaponKind, weaponId?: string, opts: ShootOptions = {}): void {
    const source = opts.source ?? 'weapon';
    const isWeapon = source === 'weapon' && Boolean(weaponId);
    const voice = this.weaponVoice(kind, weaponId);
    const time = this.ready(`shoot:${source}:${kind}:${weaponId ?? '-'}`, SHOOT_GAPS[kind] ?? 0.08);
    if (time === null) return;
    const pitch = voice.pitch * (0.97 + Math.random() * 0.06);
    const volume = voice.body * (0.95 + Math.random() * 0.1);
    const gun = voice.family === 'gun';

    switch (kind) {
      case 'melee':
        if (isWeapon && voice.family === 'arcane') {
          // Маги не должны звучать как огнестрел: у них лёгкий энергетический удар.
          this.charge(time - 0.04, volume * 0.8, pitch, voice);
          this.shimmer(time, volume * 0.9, pitch, voice);
          this.thump(time + 0.01, 0.22 * volume, pitch * 0.9, 0.16);
        } else this.meleeVoice(time, volume, pitch, voice);
        break;
      case 'explosive': {
        const id = weaponId?.toLowerCase() ?? '';
        const launcher = /grenade|rocket|launcher/.test(id) || (gun && voice.mode === 'launcher');
        const aoeScale = isWeapon && opts.aoe
          ? 1 + Math.min(1, opts.aoe / 120) * voice.body
          : 1;
        if (isWeapon) this.fuse(time - 0.07, volume * 0.9, pitch, voice, gun);
        if (launcher) this.launcherVoice(time, volume, pitch, voice, 1.25 * aoeScale);
        else {
          this.transient(time, 0.12 * volume, 0.75 * pitch);
          this.blast(time, volume * voice.body, pitch * (voice.family === 'heavy' ? 0.88 : 1),
            (voice.tier >= 2 ? 1.15 : 1) * aoeScale);
          if (voice.family === 'arcane') this.magic(time + 0.01, volume * 0.7, pitch * 0.9, true, voice);
          if (voice.undead) this.undeadVoice(time + 0.02, volume * 0.6, pitch, voice);
          if (id.includes('molotov')) this.flameVoice(time + 0.02, volume * 0.7, pitch, voice);
        }
        break;
      }
      case 'nova':
        if (isWeapon) this.charge(time - 0.05, volume, pitch, voice, gun);
        if (voice.family === 'arcane') this.magic(time, volume, pitch * 0.9, true, voice);
        else if (voice.family === 'steel') this.steelVoice(time, volume, pitch, voice, false);
        else if (voice.family === 'bone' || voice.undead) this.undeadVoice(time, volume * 1.1, pitch * 0.85, voice);
        else if (voice.family === 'heavy') this.heavyVoice(time, volume, pitch, voice);
        else if (voice.family === 'flesh') this.fleshVoice(time, volume * 1.2, pitch * 0.85, voice);
        else {
          this.thump(time, 0.32 * volume, pitch * 0.8, 0.3, true);
          this.noise(time, 0.26, 0.2 * volume, {
            type: 'lowpass', from: 1800 * pitch, to: 120 * pitch, attack: 0.002, gun: true,
          });
        }
        if (isWeapon) this.shimmer(time + 0.06, volume * 0.75, pitch, voice, gun);
        break;
      case 'flame':
        this.flameVoice(time, volume, pitch * voice.brightness, voice);
        break;
      case 'mine':
        if (isWeapon) {
          // Мина теперь узнаётся по пищалке перед щелчком и взрывом.
          this.tone(time + 0.05, 0.09, 0.05 * volume, (820 + voice.accent * 420) * pitch, {
            wave: 'square', to: (1350 + voice.phase * 500) * pitch, attack: 0.003, gun: true,
          });
        }
        this.mechanism(time, 0.08 * volume, 1.2 * pitch, true);
        this.blast(time + 0.045, volume * 0.85, pitch, 0.85);
        break;
      case 'orb':
        if (voice.family === 'bone' || voice.undead) this.undeadVoice(time, volume, pitch * 0.9, voice);
        else if (voice.family === 'arcane') this.magic(time, volume, pitch * 1.05 * voice.brightness, false, voice);
        else if (voice.family === 'steel') this.steelVoice(time, volume, pitch, voice, true);
        else if (voice.family === 'heavy') this.heavyVoice(time, volume, pitch, voice);
        else if (gun) {
          if (isWeapon) this.charge(time - 0.035, volume * 0.85, pitch, voice, true);
          this.firearmVoice(time, volume, pitch, voice);
        }
        else this.fleshVoice(time, volume, pitch, voice);
        if (isWeapon && (voice.family === 'arcane' || voice.family === 'bone' || voice.undead || gun)) {
          this.shimmer(time + 0.015, volume * 0.8, pitch, voice, gun);
        }
        break;
      case 'spread':
        if (gun) this.firearmVoice(time, volume, pitch, voice);
        else if (voice.family === 'steel') this.steelVoice(time, volume, pitch, voice, true);
        else if (voice.family === 'bone' || voice.undead) this.undeadVoice(time, volume, pitch, voice);
        else if (voice.family === 'arcane') this.magic(time, volume, pitch, true, voice);
        else if (voice.family === 'heavy') this.heavyVoice(time, volume, pitch, voice);
        else this.fleshVoice(time, volume, pitch, voice);
        break;
      case 'burst':
        if (gun) this.firearmVoice(time, volume, pitch, voice);
        else if (voice.family === 'arcane') {
          this.magic(time, volume, pitch, false, voice);
          this.transient(time + 0.035, 0.06 * volume, 1.1 * pitch);
        } else if (voice.family === 'steel') {
          this.steelVoice(time, volume, pitch, voice, true);
          this.mechanism(time + 0.04, 0.05 * volume, 1.2 * pitch);
        } else if (voice.family === 'bone' || voice.undead) {
          this.undeadVoice(time, volume, pitch, voice);
          this.rattle(time + 0.04, 0.1, 0.04 * volume, 1.2 * pitch, false, voice.signature);
        } else if (voice.family === 'heavy') this.heavyVoice(time, volume, pitch, voice);
        else this.fleshVoice(time, volume, pitch, voice);
        break;
      default:
        if (gun) this.firearmVoice(time, volume, pitch, voice);
        else if (voice.family === 'steel') this.steelVoice(time, volume, pitch, voice, true);
        else if (voice.family === 'bone' || voice.undead) this.undeadVoice(time, volume, pitch, voice);
        else if (voice.family === 'arcane') this.magic(time, volume, pitch * voice.brightness, false, voice);
        else if (voice.family === 'heavy') this.heavyVoice(time, volume, pitch, voice);
        else this.fleshVoice(time, volume, pitch, voice);
        break;
    }
    if (weaponId) this.weaponSignature(voice, time, volume, pitch);
  }

  hit(): void {
    const time = this.ready('hit', 0.035);
    if (time === null) return;
    const pitch = 0.95 + Math.random() * 0.12;
    const volume = 0.9 + Math.random() * 0.18;
    this.transient(time, 0.12 * volume, 1.1 * pitch);
    this.noise(time, 0.045, 0.09 * volume, {
      type: 'bandpass', q: 1.1, from: 2600 * pitch, to: 900 * pitch, attack: 0.0004,
    });
    this.tone(time, 0.06, 0.07 * volume, 460 * pitch, {
      wave: 'triangle', to: 180 * pitch, attack: 0.0004,
    });
  }

  crit(): void {
    const time = this.ready('crit', 0.06);
    if (time === null) return;
    const pitch = 0.98 + Math.random() * 0.08;
    this.transient(time, 0.09, 1.35 * pitch);
    this.tone(time, 0.17, 0.075, 880 * pitch, {
      wave: 'sine', to: 1760 * pitch, attack: 0.002,
    });
    this.tone(time + 0.035, 0.22, 0.05, 1320 * pitch, {
      wave: 'triangle', to: 2640 * pitch, attack: 0.004,
    });
    this.noise(time, 0.05, 0.045, {
      type: 'highpass', from: 4200, to: 6800, attack: 0.0006,
    });
  }

  pickup(): void {
    const time = this.ready('pickup', 0.07);
    if (time === null) return;
    const pitch = 0.97 + Math.random() * 0.06;
    const notes = [740, 988, 1318];
    notes.forEach((freq, index) => {
      const at = time + index * 0.075;
      this.tone(at, 0.14 + index * 0.03, 0.07 - index * 0.008, freq * pitch, {
        wave: 'sine', to: freq * 1.5 * pitch, attack: 0.006,
      });
      this.tone(at, 0.09, 0.025, freq * 2 * pitch, {
        wave: 'triangle', to: freq * 2.4 * pitch, attack: 0.004,
      });
    });
    this.noise(time + 0.14, 0.12, 0.035, {
      type: 'highpass', from: 3800, to: 6000, attack: 0.02,
    });
  }

  hurt(): void {
    const time = this.ready('hurt', 0.13);
    if (time === null) return;
    const pitch = 0.95 + Math.random() * 0.1;
    this.tone(time, 0.3, 0.12, 185 * pitch, {
      wave: 'sawtooth', to: 58 * pitch, attack: 0.002,
      filter: { from: 1200 * pitch, to: 220 * pitch, q: 1.1 },
    });
    this.tone(time, 0.34, 0.1, 92 * pitch, { wave: 'sine', to: 34 * pitch });
    this.noise(time, 0.22, 0.1, { type: 'lowpass', from: 1100 * pitch, to: 180 * pitch });
    this.noise(time, 0.06, 0.05, { type: 'bandpass', q: 0.8, from: 2200 * pitch, to: 600 * pitch });
  }

  levelUp(): void {
    const time = this.ready('levelUp', 0.5);
    if (time === null) return;
    const pitch = 0.98 + Math.random() * 0.04;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, index) => {
      const at = time + index * 0.085;
      this.tone(at, 0.2 + index * 0.035, 0.075, freq * pitch, {
        wave: 'sine', to: freq * 1.02 * pitch, attack: 0.008,
      });
      this.tone(at, 0.14, 0.025, freq * 2 * pitch, {
        wave: 'triangle', to: freq * 2.02 * pitch, detune: 6,
      });
    });
    this.tone(time, 0.45, 0.06, 130 * pitch, {
      wave: 'triangle', to: 65 * pitch, attack: 0.04,
    });
    this.noise(time + 0.26, 0.28, 0.04, {
      type: 'bandpass', q: 0.6, from: 2400, to: 5200, attack: 0.08,
    });
  }

  explosion(): void {
    const time = this.ready('explosion', 0.12);
    if (time === null) return;
    const pitch = 0.95 + Math.random() * 0.1;
    this.blast(time, 1.2, pitch, 1.35);
    this.tone(time, 0.6, 0.1, 60 * pitch, { wave: 'sine', to: 24 * pitch, attack: 0.004 });
    this.echo(time + 0.1, 0.09, pitch, 1.2, false);
  }

  death(): void {
    const time = this.ready('death', 0.6);
    if (time === null) return;
    const pitch = 0.95 + Math.random() * 0.1;
    this.tone(time, 0.85, 0.13, 300 * pitch, {
      wave: 'triangle', to: 42 * pitch, attack: 0.01,
    });
    this.tone(time, 0.9, 0.11, 150 * pitch, { wave: 'sine', to: 30 * pitch, attack: 0.02 });
    this.tone(time + 0.04, 0.75, 0.035, 302 * pitch, {
      wave: 'sawtooth', to: 45 * pitch, detune: 8, filter: { from: 900, to: 120 },
    });
    this.noise(time, 0.6, 0.09, { type: 'lowpass', from: 900 * pitch, to: 90 * pitch, attack: 0.05 });
  }

  /** Мягкий шаг по земле/камню: вызывается только во время движения. */
  footstep(): void {
    const time = this.ready('footstep', 0.2);
    if (time === null) return;
    const pitch = 0.88 + Math.random() * 0.24;
    this.noise(time, 0.08, 0.05, {
      type: 'lowpass', from: 520 * pitch, to: 170 * pitch, attack: 0.006,
    });
    this.tone(time, 0.05, 0.03, 96 * pitch, { wave: 'triangle', to: 58 * pitch });
  }

  /** Гул и силовой вихрь при входе в портал. */
  portal(): void {
    const time = this.ready('portal', 1.2);
    if (time === null) return;
    this.tone(time, 1.1, 0.1, 108, { wave: 'sine', to: 54, attack: 0.08 });
    this.tone(time, 0.9, 0.06, 324, { wave: 'triangle', to: 162, attack: 0.12 });
    this.noise(time, 1.0, 0.07, {
      type: 'bandpass', q: 0.7, from: 380, to: 2400, attack: 0.25,
      wobble: { rate: 3.2, depth: 220 },
    });
    for (let i = 0; i < 4; i += 1) {
      this.tone(time + i * 0.12, 0.35, 0.035, 520 + i * 140, {
        wave: 'sine', to: 1040 + i * 220, attack: 0.04,
      });
    }
  }

  /** Длинный порыв ветра/шорох листвы для атмосферы локаций. */
  ambient(): void {
    const time = this.ready('ambient', 7);
    if (time === null) return;
    this.noise(time, 2.8, 0.035, {
      type: 'lowpass', from: 760, to: 320, attack: 0.75,
      wobble: { rate: 0.35, depth: 180 },
    });
    this.tone(time + 0.2, 2.2, 0.018, 68, { wave: 'sine', to: 52, attack: 0.6 });
  }

  /** Магический/технический каст способности. */
  ability(): void {
    const time = this.ready('ability', 0.16);
    if (time === null) return;
    this.tone(time, 0.28, 0.075, 260, { wave: 'triangle', to: 920, attack: 0.01 });
    this.tone(time + 0.05, 0.22, 0.04, 520, { wave: 'sine', to: 1560, attack: 0.02 });
    this.noise(time, 0.22, 0.05, {
      type: 'bandpass', q: 1.2, from: 900, to: 4200, attack: 0.02,
    });
  }

  /** Короткое подтверждение действия в меню/бою. */
  confirm(): void {
    const time = this.ready('confirm', 0.09);
    if (time === null) return;
    this.tone(time, 0.12, 0.06, 523.25, { wave: 'sine', to: 528 });
    this.tone(time + 0.07, 0.18, 0.055, 783.99, { wave: 'triangle', to: 792 });
  }

  /** Громкость и включение фоновой музыки из настроек. */
  setMusicSettings(enabled: boolean, volume: number): void {
    this.musicEnabled = enabled;
    this.musicVolume = Math.min(1, Math.max(0, Number(volume) || 0));
    if (this.musicBus) {
      this.musicBus.gain.value = enabled ? 0.62 * this.musicVolume : 0;
    }
  }

  /** Меняет процедурный саундтрек: треки синтезируются в WebAudio, без внешних файлов и лицензий. */
  setMusic(scene: MusicScene): void {
    if (this.musicScene === scene) return;
    this.musicScene = scene;
    if (this.musicTimer) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = 0;
    }
    if (scene === 'none') return;
    const ctx = this.ensure();
    if (!ctx || !this.musicBus) return;
    this.unlock();
    this.musicStep = 0;
    this.musicNext = ctx.currentTime + 0.08;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 120);
    this.scheduleMusic();
  }

  dispose(): void {
    this.setMusic('none');
  }

  private musicFreq(note: number): number {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  private musicNote(
    time: number,
    note: number,
    duration: number,
    volume: number,
    wave: OscillatorType,
    cutoff: number,
    attack = 0.02,
    detune = 0,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(this.musicFreq(note), time);
    osc.detune.value = detune;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.42), time + duration);
    const gain = ctx.createGain();
    const rise = Math.min(Math.max(0.003, attack), duration * 0.4);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + rise);
    gain.gain.setValueAtTime(volume * 0.82, time + duration * 0.55);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(filter).connect(gain).connect(this.musicBus);
    osc.start(time);
    osc.stop(time + duration + 0.04);
  }

  private musicHit(time: number, volume: number, cutoff: number, duration: number, color: NoiseColor = 'white'): void {
    const ctx = this.ctx;
    const buffer = color === 'brown' ? this.brownBuffer : this.noiseBuffer;
    if (!ctx || !buffer || !this.musicBus) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, time);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.0001, volume), time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter).connect(gain).connect(this.musicBus);
    const maxOffset = Math.max(0, buffer.duration - duration - 0.02);
    source.start(time, Math.random() * maxOffset, duration);
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || this.musicScene === 'none' || !this.musicBus) return;
    if (this.musicNext < ctx.currentTime - 0.5) this.musicNext = ctx.currentTime + 0.05;
    const bpm = this.musicScene === 'boss' ? 132
      : this.musicScene === 'city' ? 96
        : this.musicScene === 'explore' ? 86 : 64;
    const eighth = 60 / bpm / 2;
    while (this.musicNext < ctx.currentTime + 0.45) {
      this.musicStep = (this.musicStep + 1) % 16;
      this.playMusicStep(this.musicNext, this.musicStep, this.musicScene, eighth);
      this.musicNext += eighth;
    }
  }

  private playMusicStep(
    time: number,
    step: number,
    scene: Exclude<MusicScene, 'none'>,
    eighth: number,
  ): void {
    const root = scene === 'boss' ? 41 : scene === 'city' ? 48 : scene === 'explore' ? 45 : 50;
    const bassPattern = [0, 0, 7, 0, 3, 0, 10, 7];
    const bossPattern = [0, 0, 6, 0, 1, 0, 6, 7];

    // Медленный минорный/ACID-подклад — основа тревожной атмосферы.
    if (step % 8 === 0) {
      const chord = scene === 'boss' ? [0, 1, 6, 10]
        : scene === 'menu' ? [0, 3, 7] : [0, 3, 7, 10];
      for (const interval of chord) {
        this.musicNote(
          time, root + 12 + interval, eighth * 7.4,
          scene === 'boss' ? 0.026 : 0.02,
          'triangle', scene === 'boss' ? 420 : 620, 0.32,
          interval % 3 === 0 ? 4 : -4,
        );
      }
    }

    if (scene === 'boss') {
      if (step % 2 === 0 || step % 4 === 3) {
        const note = root - 12 + bossPattern[Math.floor(step / 2) % bossPattern.length];
        this.musicNote(time, note, eighth * 0.85, 0.085, 'sawtooth', 460, 0.003);
        this.musicNote(time, note - 12, eighth * 1.1, 0.06, 'sine', 170, 0.004);
      }
      if (step === 0 || step === 3 || step === 8 || step === 11) {
        this.musicHit(time, 0.1, 170, 0.18, 'brown');
      }
      if (step % 2 === 1) this.musicHit(time, 0.022, 3800, 0.035);
      if (step === 6 || step === 14) this.musicHit(time, 0.035, 2800, 0.12);
      if (step === 4 || step === 12) {
        this.musicNote(time, root + 13, eighth * 2, 0.03, 'square', 900, 0.004);
        this.musicNote(time, root + 18, eighth * 1.4, 0.018, 'sine', 2400, 0.004);
      }
      return;
    }

    if (step % 2 === 0) {
      const note = root - 12 + bassPattern[(step / 2) % bassPattern.length];
      this.musicNote(
        time, note, eighth * 1.7,
        scene === 'menu' ? 0.075 : 0.09,
        'triangle', scene === 'city' ? 380 : 300, 0.008,
      );
      if (step % 8 === 0) this.musicNote(time, note - 12, eighth * 2, 0.045, 'sine', 180, 0.01);
    }
    if (scene === 'menu') {
      if (step === 0) this.musicHit(time, 0.025, 120, 0.16, 'brown');
      if (step === 3 || step === 11) {
        this.musicNote(time, root + 19 + (step === 11 ? 3 : 0), eighth * 3, 0.026, 'sine', 2200, 0.008);
      }
    } else {
      if (step === 0 || step === 8) this.musicHit(time, 0.05, 150, 0.14, 'brown');
      if (step === 4 || step === 12) this.musicHit(time, 0.018, 3200, 0.04);
      if (scene === 'explore' && step === 13) {
        this.musicNote(time, root + 15, eighth * 2, 0.022, 'sine', 1800, 0.01);
      }
      if (scene === 'city' && (step === 2 || step === 10)) {
        this.musicNote(time, root + 12 + (step === 10 ? 6 : 0), eighth * 1.5, 0.018, 'sine', 1600, 0.008);
      }
    }
  }

  click(): void {
    const time = this.ready('click', 0.03);
    if (time === null) return;
    const pitch = 0.96 + Math.random() * 0.08;
    this.transient(time, 0.07, 1.25 * pitch);
    this.tone(time, 0.03, 0.035, 820 * pitch, {
      wave: 'sine', to: 540 * pitch, attack: 0.0004,
    });
    this.tone(time, 0.03, 0.02, 190 * pitch, {
      wave: 'triangle', to: 120 * pitch, attack: 0.0004,
    });
  }
}
