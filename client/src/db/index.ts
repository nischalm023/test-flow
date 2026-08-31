import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const globalForDb = globalThis as unknown as {
  postgres: ReturnType<typeof postgres> | undefined;
};

const client = globalForDb.postgres ?? postgres(connectionString, { max: 1 });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.postgres = client;
}

export const db = drizzle(client, { schema });
export { schema };
