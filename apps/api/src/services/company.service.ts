import { prisma } from '../lib/prisma';
import { conflict, notFound } from '../lib/errors';
import type { CompanyCreateInput, CompanyUpdateInput } from '../schemas';

export interface CompanyDto {
  id: string;
  userId: string;
  name: string;
  website: string | null;
  industry: string | null;
  notes: string | null;
  createdAt: Date;
  applicationCount: number;
}

export async function listCompanies(userId: string): Promise<CompanyDto[]> {
  const companies = await prisma.company.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { applications: true } } },
  });

  return companies.map((company) => ({
    id: company.id,
    userId: company.userId,
    name: company.name,
    website: company.website,
    industry: company.industry,
    notes: company.notes,
    createdAt: company.createdAt,
    applicationCount: company._count.applications,
  }));
}

export async function createCompany(userId: string, input: CompanyCreateInput): Promise<CompanyDto> {
  const company = await prisma.company.create({
    data: {
      userId,
      name: input.name,
      website: nullableOrUndefined(input.website),
      industry: nullableOrUndefined(input.industry),
      notes: nullableOrUndefined(input.notes),
    },
  });
  return toDto(company);
}

export async function updateCompany(
  userId: string,
  companyId: string,
  input: CompanyUpdateInput,
): Promise<CompanyDto> {
  const existing = await prisma.company.findFirst({ where: { id: companyId, userId } });
  if (!existing) {
    throw notFound('Company not found');
  }

  const updated = await prisma.company.update({
    where: { id: companyId },
    data: {
      name: input.name,
      website: nullableOrUndefined(input.website),
      industry: nullableOrUndefined(input.industry),
      notes: nullableOrUndefined(input.notes),
    },
  });
  return toDto(updated);
}

export async function deleteCompany(userId: string, companyId: string): Promise<void> {
  const existing = await prisma.company.findFirst({ where: { id: companyId, userId } });
  if (!existing) {
    throw notFound('Company not found');
  }

  const applicationCount = await prisma.application.count({ where: { companyId } });
  if (applicationCount > 0) {
    throw conflict(
      `This company still has ${applicationCount} ${
        applicationCount === 1 ? 'application' : 'applications'
      }. Delete its applications before removing the company.`,
    );
  }

  await prisma.company.delete({ where: { id: companyId } });
}

function toDto(company: {
  id: string;
  userId: string;
  name: string;
  website: string | null;
  industry: string | null;
  notes: string | null;
  createdAt: Date;
}): CompanyDto {
  return { ...company, applicationCount: 0 };
}

function nullableOrUndefined(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value.trim() === '' ? null : value.trim();
}