import { PrismaClient, Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

export function getEnv(name: string, def: string): string {
  return process.env[name]?.trim() || def;
}

export interface SeedAdminOpts {
  email: string;
  password: string;
  fullName: string;
  rounds: number;
}

export async function seedAdmin(
  db: { user: { findUnique: Function; create: Function } },
  opts: SeedAdminOpts,
): Promise<string> {
  const existing = await db.user.findUnique({ where: { email: opts.email } });
  if (existing) {
    return existing.id as string;
  }
  const passwordHash = await bcrypt.hash(opts.password, opts.rounds);
  const created = await db.user.create({
    data: {
      email: opts.email,
      passwordHash,
      fullName: opts.fullName,
      role: Role.ADMIN,
      isActive: true,
    },
  });
  return created.id as string;
}

export interface SeedBookOpts {
  isbn: string;
  title: string;
  author: string;
  totalStock: number;
}

export async function seedBook(
  db: { book: { findUnique: Function; create: Function } },
  opts: SeedBookOpts,
): Promise<string> {
  const existing = await db.book.findUnique({ where: { isbn: opts.isbn } });
  if (existing) {
    return existing.id as string;
  }
  const created = await db.book.create({
    data: {
      isbn: opts.isbn,
      title: opts.title,
      author: opts.author,
      totalStock: opts.totalStock,
      availableStock: opts.totalStock,
    },
  });
  return created.id as string;
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  try {
    const adminId = await seedAdmin(prisma, {
      email: getEnv('SEED_ADMIN_EMAIL', 'alice@example.com'),
      password: getEnv('SEED_ADMIN_PASSWORD', 'P@ssw0rd!'),
      fullName: getEnv('SEED_ADMIN_NAME', 'Alice Admin'),
      rounds: parseInt(getEnv('BCRYPT_ROUNDS', '10'), 10),
    });
    console.log(`[seed] admin ready: ${adminId}`);

    if (getEnv('SEED_SAMPLE_BOOK', 'true') === 'true') {
      const id1 = await seedBook(prisma, {
        isbn: '978-0-13-468599-1',
        title: 'The Pragmatic Programmer',
        author: 'Andrew Hunt',
        totalStock: 3,
      });
      console.log(`[seed] book ready: ${id1}`);
    }

    if (getEnv('SEED_LOAN_SAMPLE_BOOK', 'true') === 'true') {
      const id2 = await seedBook(prisma, {
        isbn: '978-013475759-9',
        title: 'Refactoring',
        author: 'Martin Fowler',
        totalStock: 2,
      });
      console.log(`[seed] book ready: ${id2}`);
    }

    console.log(`[seed] done in ${Date.now() - startedAt}ms`);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError ||
      err instanceof Prisma.PrismaClientInitializationError
    ) {
      console.error(`[seed] database not ready: ${err.message}`);
    }
    throw err;
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('[seed] failed:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
