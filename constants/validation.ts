// constants/validation.ts
import { UnitType } from '../types/db';

type Range = { min: number; max: number };

// Границы "Здравого смысла" (Safety Limits)
export const SAFETY_LIMITS: Record<string, Record<UnitType | 'common', Range>> = {
  na: {
    common: { min: 50, max: 250 }, // mEq/L и mmol/L совпадают
  },
  glucose: {
    'mg/dL': { min: 10, max: 3000 },
    'mmol/L': { min: 0.5, max: 170 },
  },
  bun: { // Азот мочевины / Мочевина
    'mg/dL': { min: 1, max: 300 },
    'mmol/L': { min: 0.3, max: 110 },
  },
  ethanol: {
    'mg/dL': { min: 0, max: 1500 }, // >500 уже кома, но запас нужен
    'mmol/L': { min: 0, max: 350 },
  },
  measured_osmolality: {
    common: { min: 150, max: 600 }, // Обычно 275-295, но при патологии шире
  }
};

export const validateInput = (key: string, value: string, units: UnitType): string | null => {
  if (!value) return null;
  
  const num = parseFloat(value);
  if (isNaN(num)) return 'Не число';

  // Определяем какой лимит брать (зависит от единиц или общий)
  const limitGroup = SAFETY_LIMITS[key];
  const limit = limitGroup[units] || limitGroup['common'];

  if (!limit) return null;

  if (num < limit.min) return `Минимум: ${limit.min}`;
  if (num > limit.max) return `Максимум: ${limit.max}`;

  return null;
};