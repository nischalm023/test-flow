import { boolean, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['USER', 'ORGANIZER', 'ADMIN']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  role: userRoleEnum('role').notNull().default('USER'),
  githubLogin: text('github_login'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const repoScanStatusEnum = pgEnum('repo_scan_status', ['PENDING', 'COMPLETED', 'FAILED']);

export const repoScans = pgTable('repo_scans', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  owner: text('owner').notNull(),
  repoName: text('repo_name').notNull(),
  setupBranch: text('setup_branch').notNull(),
  baseBranch: text('base_branch').notNull(),
  testsFolderCreated: boolean('tests_folder_created').notNull().default(false),
  status: repoScanStatusEnum('status').notNull().default('PENDING'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
