import { seedAdmin, seedBook, getEnv } from './seed';

class FakePrisma {
  users: any[] = [];
  books: any[] = [];

  user = {
    findUnique: async ({ where }: { where: { email: string } }) =>
      this.users.find((u) => u.email === where.email) ?? null,
    create: async ({ data }: { data: any }) => {
      const u = { id: `user-${this.users.length + 1}`, ...data };
      this.users.push(u);
      return u;
    },
  };
  book = {
    findUnique: async ({ where }: { where: { isbn: string } }) =>
      this.books.find((b) => b.isbn === where.isbn) ?? null,
    create: async ({ data }: { data: any }) => {
      const b = { id: `book-${this.books.length + 1}`, ...data };
      this.books.push(b);
      return b;
    },
  };
}

describe('seedAdmin (idempotent)', () => {
  it('creates the admin on a fresh DB', async () => {
    const prisma = new FakePrisma();
    const id = await seedAdmin(prisma as any, {
      email: 'a@b.c',
      password: 'secret',
      fullName: 'A',
      rounds: 4,
    });
    expect(id).toBe('user-1');
    expect(prisma.users).toHaveLength(1);
    expect(prisma.users[0].email).toBe('a@b.c');
    expect(prisma.users[0].role).toBe('ADMIN');
    expect(prisma.users[0].passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('returns the existing id on re-run, does not duplicate', async () => {
    const prisma = new FakePrisma();
    const id1 = await seedAdmin(prisma as any, {
      email: 'a@b.c',
      password: 'secret',
      fullName: 'A',
      rounds: 4,
    });
    const id2 = await seedAdmin(prisma as any, {
      email: 'a@b.c',
      password: 'secret',
      fullName: 'A',
      rounds: 4,
    });
    expect(id1).toBe(id2);
    expect(prisma.users).toHaveLength(1);
  });
});

describe('seedBook (idempotent)', () => {
  it('creates a book with the given stock', async () => {
    const prisma = new FakePrisma();
    const id = await seedBook(prisma as any, {
      isbn: '978-0-13-468599-1',
      title: 'T',
      author: 'A',
      totalStock: 3,
    });
    expect(id).toBe('book-1');
    expect(prisma.books[0]).toMatchObject({
      isbn: '978-0-13-468599-1',
      totalStock: 3,
      availableStock: 3,
    });
  });

  it('returns the same id on re-run, does not duplicate', async () => {
    const prisma = new FakePrisma();
    const id1 = await seedBook(prisma as any, {
      isbn: 'X',
      title: 'T',
      author: 'A',
      totalStock: 2,
    });
    const id2 = await seedBook(prisma as any, {
      isbn: 'X',
      title: 'Different title',
      author: 'Different',
      totalStock: 99,
    });
    expect(id1).toBe(id2);
    expect(prisma.books).toHaveLength(1);
    expect(prisma.books[0].title).toBe('T');
  });
});

describe('getEnv', () => {
  it('returns default when env is empty', () => {
    expect(getEnv('NOT_SET', 'def')).toBe('def');
  });
  it('returns trimmed env when set', () => {
    process.env.SEED_TEST = '  hello  ';
    expect(getEnv('SEED_TEST', 'def')).toBe('hello');
    delete process.env.SEED_TEST;
  });
});
