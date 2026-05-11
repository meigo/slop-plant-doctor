// Core types for diagnoses.

export type Species = {
  name: string;
  confidence: number;
  commonNames?: string[];
};

export type RecoveryStep = {
  action: string;
  when: string;
};

export type PrimaryDiagnosis = {
  name: string;
  confidence: number;
  rationale: string;
  recovery: RecoveryStep[];
};

export type AlternativeDiagnosis = {
  name: string;
  confidence: number;
  rationale: string;
};

export type DiagnosisResult = {
  species: Species | null;
  primary: PrimaryDiagnosis;
  alternatives: AlternativeDiagnosis[];
  whatWouldChangeMyMind: string[];
  meta: {
    model: string;
    createdAt: string;
  };
};

// Server-side wrapper stored in KV.
export type StoredDiagnosis = {
  result: DiagnosisResult;
  createdAt: string;
};

// HTTP error codes the API can return — mapped to user-facing copy on the client.
export type ApiErrorCode =
  | 'turnstile_failed'
  | 'rate_limited'
  | 'daily_cap_per_ip'
  | 'budget_exhausted'
  | 'photo_too_large'
  | 'photo_unsupported_format'
  | 'text_too_long'
  | 'llm_error'
  | 'schema_error'
  | 'internal_error';
