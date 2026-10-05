import { z } from 'zod';

import { ApplicationStatus } from '../types';

export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z
  .object({
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export const companySchema = z.object({
  name: z.string().min(1, 'Company name is required').max(200, 'Keep it under 200 characters'),
  website: z.string().max(500).optional().or(z.literal('')),
  industry: z.string().max(100, 'Keep it under 100 characters').optional().or(z.literal('')),
  notes: z.string().max(10_000).optional().or(z.literal('')),
});

export const applicationSchema = z.object({
  companyId: z.string().min(1, 'Select a company'),
  roleTitle: z.string().min(1, 'Role title is required').max(300, 'Keep it under 300 characters'),
  jobDescription: z
    .string()
    .min(10, 'Paste at least 10 characters of the job description')
    .max(200_000, 'Job description is too long — keep it under 200,000 characters'),
  postingUrl: z.string().url('Enter a valid URL').or(z.literal('')).optional(),
  location: z.string().max(200).optional().or(z.literal('')),
  isRemote: z.boolean(),
  salaryRange: z.string().max(100).optional().or(z.literal('')),
  resumeVersion: z.string().max(200).optional().or(z.literal('')),
  currentStatus: z.nativeEnum(ApplicationStatus),
  appliedAt: z.string().optional().or(z.literal('')),
  tags: z.array(z.string()).max(30, 'You can add at most 30 tags'),
});

export const statusChangeSchema = z.object({
  status: z.nativeEnum(ApplicationStatus),
  note: z.string().max(2000).optional().or(z.literal('')),
});

export const tagSchema = z.object({
  name: z
    .string()
    .min(1, 'Tag name is required')
    .max(50, 'Keep it under 50 characters')
    .trim()
    .regex(/^[\w\s\-+#.]+$/i, 'Only letters, numbers, spaces, and - +# . are allowed'),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type CompanyValues = z.infer<typeof companySchema>;
export type ApplicationFormValues = z.infer<typeof applicationSchema>;
export type StatusChangeValues = z.infer<typeof statusChangeSchema>;
export type TagValues = z.infer<typeof tagSchema>;

export function emptyToUndefined(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.trim() === '' ? undefined : value.trim();
}