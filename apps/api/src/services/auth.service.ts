import bcrypt from 'bcryptjs';

import { signToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { conflict, unauthorized } from '../lib/errors';
import type { LoginInput, RegisterInput } from '../schemas';

export interface AuthUserInfo {
  id: string;
  email: string;
  createdAt: Date;
}

export interface AuthResult {
  token: string;
  user: AuthUserInfo;
}

const BCRYPT_ROUNDS = 10;

export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw conflict('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: { email: input.email, passwordHash },
  });

  return { token: signToken(user.id), user: publicUser(user) };
}

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  if (!user) {
    throw unauthorized('Invalid email or password');
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw unauthorized('Invalid email or password');
  }

  return { token: signToken(user.id), user: publicUser(user) };
}

function publicUser(user: { id: string; email: string; createdAt: Date }): AuthUserInfo {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}