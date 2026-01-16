// constants/formulas.ts
import { UnitType } from '../types/db';

export const calculateOsmolality = (
  na: number,
  glucose: number,
  bun: number,
  ethanol: number = 0,
  units: UnitType
) => {
  let calcOsm = 0;

  if (units === 'mg/dL') {
    // Формула для США: 2*Na + Glucose/18 + BUN/2.8 (+ Ethanol/4.6 если есть)
    // Этанол часто добавляют, если он есть. Делитель для этанола ~3.7-4.6, возьмем стандарт 4.6 (если mg/dL)
    // Но часто используют упрощенную без этанола. Здесь добавим поддержку этанола.
    const ethPart = ethanol ? ethanol / 4.6 : 0;
    calcOsm = 2 * na + glucose / 18 + bun / 2.8 + ethPart;
  } else {
    // Формула для СИ (mmol/L): 2*Na + Glucose + Urea (BUN) + Ethanol
    calcOsm = 2 * na + glucose + bun + ethanol;
  }

  return parseFloat(calcOsm.toFixed(1));
};

export const calculateGap = (measured: number, calculated: number) => {
  return parseFloat((measured - calculated).toFixed(1));
};

export const OSMOLALITY_REF_RANGE = { min: 275, max: 295 };