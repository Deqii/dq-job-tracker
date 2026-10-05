import 'dotenv/config';

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
} as const;

export function assertConfig(): void {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env.');
  }
  if (!config.jwtSecret) {
    throw new Error('JWT_SECRET is not set. Copy apps/api/.env.example to apps/api/.env.');
  }
}