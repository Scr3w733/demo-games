import { BIOMES, MAX_PROFILE_LEVEL } from './config';
import type { BiomeDef } from './types';

export interface CampaignRecord {
  bestTime: number;
  kills: number;
  runs: number;
  completed: boolean;
}

/** Survival threshold for a level to count as cleared. */
export const CAMPAIGN_CLEAR_TIME = 60;

export interface CampaignLevel {
  level: number;
  biomeIndex: number;
  biome: BiomeDef;
  name: string;
  subtitle: string;
  /**Scaling of enemy HP and damage. 1 at level 1, up to ~4.5 at level 1000. */
  difficulty: number;
  rewardMul: number;
}

const DISTRICTS = [
  'Могильный двор', 'Костяной переулок', 'Забытая часовня', 'Пепельный сад', 'Склеп шепотов',
  'Тропа мертвецов', 'Двор палача', 'Проклятый колодец', 'Черный обелиск', 'Кладбищенская ограда',
  'Каменный лабиринт', 'Затонувший зал', 'Ржавый мост', 'Гробовая аллея', 'Старый амфитеатр',
  'Молчаливый ряд', 'Ветхий амфитеатр', 'Болотная тропа', 'Кострённый круг', 'Тронная зала',
  'Подземный ход', 'Дымный перекрёсток', 'Сухая река', 'Замерзший пруд', 'Пепелище',
  'Светящийся тунель', 'Древний колодезь', 'Разбитый некрополь', 'Черный обелиск', 'Королевская усыпальница',
  'Серный источник', 'Заброшенный лагерь', 'Призрачная роща', 'Последняя башня', 'Кровавый подвал',
  'Тихий дворец', 'Обгоревшая беседка', 'Гнилой прут', 'Лунный обелиск', 'Врата титана',
];

const EPITHETS = [
  'Забытый', 'Пепельный', 'Кровавый', 'Безмолвный', 'Проклятый',
  'Морозный', 'Гнилостный', 'Янтарный', 'Хрустальный', 'Сумеречный',
  'Тихий', 'Железный', 'Костяной', 'Вулканический', 'Лунный',
  'Затопленный', 'Обгоревший', 'Бледный', 'Глубокий', 'Последний',
  'Древний', 'Сломанный', 'Ядовитый', 'Звёздный', 'Вечный',
];

/** Returns one of 1000 deterministic, named locations. */
export function campaignLevel(level: number): CampaignLevel {
  const safe = Math.min(MAX_PROFILE_LEVEL, Math.max(1, Math.floor(level) || 1));
  const index = safe - 1;
  const biomeIndex = index % BIOMES.length;
  const district = DISTRICTS[Math.floor(index / BIOMES.length) % DISTRICTS.length];
  const epithet = EPITHETS[Math.floor(index / (BIOMES.length * DISTRICTS.length)) % EPITHETS.length];
  const difficulty = Number((1 + Math.min(3.5, index * 0.0035)).toFixed(3));
  return {
    level: safe,
    biomeIndex,
    biome: BIOMES[biomeIndex],
    name: `${district} · ${epithet}`,
    subtitle: `Уровень ${safe}. ${BIOMES[biomeIndex].subtitle}`,
    difficulty,
    rewardMul: Number((1 + index * 0.002).toFixed(3)),
  };
}
