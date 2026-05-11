import { z } from 'zod';

const SpeciesSchema = z.object({
  name: z.string().min(1),
  confidence: z.number().min(0).max(1),
  commonNames: z.array(z.string()).optional()
});

const RecoveryStepSchema = z.object({
  action: z.string().min(1),
  when: z.string().min(1)
});

const PrimaryDiagnosisSchema = z.object({
  name: z.string().min(1),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  recovery: z.array(RecoveryStepSchema)
});

const AlternativeDiagnosisSchema = z.object({
  name: z.string().min(1),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1)
});

export const DiagnosisResultSchema = z.object({
  species: SpeciesSchema.nullable(),
  primary: PrimaryDiagnosisSchema,
  alternatives: z.array(AlternativeDiagnosisSchema),
  whatWouldChangeMyMind: z.array(z.string()),
  meta: z.object({
    model: z.string().min(1),
    createdAt: z.string().min(1)
  })
});

export type DiagnosisResultZ = z.infer<typeof DiagnosisResultSchema>;
