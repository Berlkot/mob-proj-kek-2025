export type Case = {
  id: string
  user_id: string
  title: string | null
  status: 'draft' | 'final'
  created_at: string
}

export type CaseInput = {
  case_id: string
  units: 'mg/dL' | 'mmol/L'
  na: number | null
  glucose: number | null
  bun: number | null
  ethanol: number | null
  measured_osmolality: number | null
}

export type CaseResult = {
  case_id: string
  formula_id: string
  calculated_osmolality: number
  osmolal_gap: number | null
}

export type LLMInterpretation = {
  id: string
  case_id: string
  result_json: {
    summary: string
    recommendations: string[]
    warning?: string
  }
  status: 'ok' | 'error'
}