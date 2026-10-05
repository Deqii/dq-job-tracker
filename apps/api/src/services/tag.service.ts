import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

export interface TagDto {
  id: string;
  name: string;
}

export async function listTags(userId: string): Promise<TagDto[]> {
  const tags = await prisma.tag.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
  });
  return tags.map(toDto);
}

export async function createTag(userId: string, name: string): Promise<TagDto> {
  const normalized = normalizeTagName(name);
  const tag = await prisma.tag.upsert({
    where: { userId_name: { userId, name: normalized } },
    create: { userId, name: normalized },
    update: {},
  });
  return toDto(tag);
}

export async function resolveTagNames(
  tx: Prisma.TransactionClient,
  userId: string,
  names: string[],
): Promise<TagDto[]> {
  const unique = [...new Set(names.map(normalizeTagName).filter(Boolean))];
  const resolved: TagDto[] = [];

  for (const name of unique) {
    const tag = await tx.tag.upsert({
      where: { userId_name: { userId, name } },
      create: { userId, name },
      update: {},
    });
    resolved.push({ id: tag.id, name: tag.name });
  }

  return resolved;
}

function normalizeTagName(name: string): string {
  return name.trim().toLowerCase();
}

function toDto(tag: { id: string; name: string }): TagDto {
  return { id: tag.id, name: tag.name };
}