import { z } from 'zod';

import { ApplicationStatus } from '@prisma/client';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

const optionalText = (max: number, message?: string) =>
  z.string().max(max, message).optional().or(z.literal(''));

export const companyCreateSchema = z.object({
  name: z.string().trim().min(1, 'Company name is required').max(200, 'Keep it under 200 characters'),
  website: optionalText(500, 'Keep it under 500 characters'),
  industry: optionalText(100, 'Keep it under 100 characters'),
  notes: optionalText(10_000, 'Keep it under 10,000 characters'),
});
export type CompanyCreateInput = z.infer<typeof companyCreateSchema>;

export const companyUpdateSchema = companyCreateSchema.partial();
export type CompanyUpdateInput = z.infer<typeof companyUpdateSchema>;

export const applicationCreateSchema = z.object({
  companyId: z.string().min(1, 'Company is required'),
  roleTitle: z.string().trim().min(1, 'Role title is required').max(300, 'Keep it under 300 characters'),
  jobDescription: z.string().trim().min(1, 'Job description is required').max(200_000, 'Too long'),
  postingUrl: optionalText(500, 'Keep it under 500 characters'),
  location: optionalText(200, 'Keep it under 200 characters'),
  isRemote: z.boolean().default(false),
  salaryRange: optionalText(100, 'Keep it under 100 characters'),
  resumeVersion: optionalText(200, 'Keep it under 200 characters'),
  currentStatus: z.nativeEnum(ApplicationStatus).default(ApplicationStatus.APPLIED),
  appliedAt: z.string().datetime().optional().or(z.literal('')),
  tags: z.array(z.string().trim().min(1).max(50)).max(30, 'At most 30 tags per application').default([]),
});
export type ApplicationCreateInput = z.infer<typeof applicationCreateSchema>;

// NOTE: jobDescription is intentionally absent. A stored job description snapshot is
// immutable by design — it must never be overwritten by an update request.
export const applicationUpdateSchema = z.object({
  companyId: z.string().min(1).optional(),
  roleTitle: z.string().trim().min(1, 'Role title is required').max(300).optional(),
  postingUrl: optionalText(500),
  location: optionalText(200),
  isRemote: z.boolean().optional(),
  salaryRange: optionalText(100),
  resumeVersion: optionalText(200),
  appliedAt: z.string().datetime().optional().or(z.literal('')),
  tags: z.array(z.string().trim().min(1).max(50)).max(30, 'At most 30 tags per application').optional(),
});
export type ApplicationUpdateInput = z.infer<typeof applicationUpdateSchema>;

export const statusChangeSchema = z.object({
  status: z.nativeEnum(ApplicationStatus),
  note: optionalText(2000, 'Keep it under 2,000 characters'),
});
export type StatusChangeInput = z.infer<typeof statusChangeSchema>;

export const tagCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Tag name is required')
    .max(50, 'Keep it under 50 characters')
    .regex(/^[\w\s\-+#.]+$/i, 'Only letters, numbers, spaces, and - +# . are allowed'),
});
export type TagCreateInput = z.infer<typeof tagCreateSchema>;

export const applicationFiltersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.nativeEnum(ApplicationStatus).optional(),
  tag: z.string().trim().max(50).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});
export type ApplicationFilters = z.infer<typeof applicationFiltersSchema>;

export function validateBody<O, I>(schema: z.ZodType<O, z.ZodTypeDef, I>, body: unknown): O {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error);
  }
  return parsed.data;
}

export function validateQuery<O, I>(schema: z.ZodType<O, z.ZodTypeDef, I>, query: unknown): O {
  return validateBody(schema, query);
}

export class ValidationError extends Error {
  constructor(
    public readonly zodError: z.ZodError,
  ) {
    super('Validation failed');
    this.name = 'ValidationError';
  }

  toBody(): { message: string; errors: Record<string, string[]> } {
    const errors: Record<string, string[]> = {};
    for (const issue of this.zodError.issues) {
      const key = issue.path.join('.') || 'body';
      errors[key] = errors[key] ?? [];
      errors[key].push(issue.message);
    }
    return { message: 'Validation failed', errors };
  }
}