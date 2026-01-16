// types/db.ts

export type UnitType = 'mg/dL' | 'mmol/L';

export interface Case {
  id: string;
  user_id: string;
  title?: string;
  status: 'draft' | 'final';
  created_at: string;
}

export interface CaseInput {
  case_id: string;
  units: UnitType;
  na: number | null;
  glucose: number | null;
  bun: number | null;
  ethanol: number | null;
  measured_osmolality: number | null;
}

export interface CaseResult {
  case_id: string;
  formula_id: string;
  calculated_osmolality: number;
  osmolal_gap: number | null;
}

export type ClinicalContext = 'patient' | 'doctor';