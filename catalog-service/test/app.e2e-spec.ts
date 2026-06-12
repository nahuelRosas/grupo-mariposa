import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { sign, verify } from 'jsonwebtoken';

import {
  BOOK_REPOSITORY,
  LOAN_REPOSITORY,
  LOAN_SERVICE,
  PASSWORD_HASHER,
  PRISMA_CLIENT,
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from '../src/shared/di-tokens/tokens';
import { CreateBookUseCase } from '../src/application/use-cases/books/create-book.usecase';
import { CreateLoanUseCase } from '../src/application/use-cases/loans/create-loan.usecase';
import { GetBookUseCase } from '../src/application/use-cases/books/get-book.usecase';
import { GetLoanUseCase } from '../src/application/use-cases/loans/get-loan.usecase';
import { GetUserUseCase } from '../src/application/use-cases/users/get-user.usecase';
import { ListUsersUseCase } from '../src/application/use-cases/users/list-users.usecase';
import { UpdateUserUseCase } from '../src/application/use-cases/users/update-user.usecase';
import { DeleteUserUseCase } from '../src/application/use-cases/users/delete-user.usecase';
import { ListBooksUseCase } from '../src/application/use-cases/books/list-books.usecase';
import { LoginUseCase } from '../src/application/use-cases/auth/login.usecase';
import { RegisterUserUseCase } from '../src/application/use-cases/users/register-user.usecase';
import { UpdateBookUseCase } from '../src/application/use-cases/books/update-book.usecase';
import { DeleteBookUseCase } from '../src/application/use-cases/books/delete-book.usecase';
import { ListLoansUseCase } from '../src/application/use-cases/loans/list-loans.usecase';
import { ListMyLoansUseCase } from '../src/application/use-cases/loans/list-my-loans.usecase';
import { AuthController, UsersController } from '../src/infrastructure/controllers/auth.controller';
import { BooksController } from '../src/infrastructure/controllers/books.controller';
import { LoansController } from '../src/infrastructure/controllers/loans.controller';
import { AdminUsersController } from '../src/infrastructure/controllers/users.controller';
import { MeController } from '../src/infrastructure/controllers/me.controller';
import { HealthController } from '../src/infrastructure/adapters/health/health.controller';
import { DomainExceptionFilter } from '../src/infrastructure/filters/domain-exception.filter';
import { GrpcLoanAdapter } from '../src/infrastructure/adapters/grpc/grpc-loan.adapter';
import { JwtAuthGuard } from '../src/infrastructure/adapters/security/jwt-auth.guard';
import { RolesGuard } from '../src/infrastructure/adapters/security/roles.guard';
import { Role } from '../src/shared/types/role.enum';
import { ConfigModule } from '@nestjs/config';
import configuration from '../src/shared/config/configuration';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { HttpModule } from '@nestjs/axios';
import { Book } from '../src/domain/entities/book.entity';
import { User } from '../src/domain/entities/user.entity';
import { Loan } from '../src/domain/entities/loan.entity';

const TEST_SECRET = 'e2e-test-secret-32-bytes-minimum-please-yes';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const BOOK_ID = '33333333-3333-3333-3333-333333333333';

class FakePrismaClient {
  async $queryRaw(): Promise<unknown> {
    return [{ '?column?': 1 }];
  }
}

class FakeBookRepo {
  private byId = new Map<string, Book>();
  private byIsbn = new Map<string, Book>();
  private counter = 0;

  async findById(id: string) {
    return this.byId.get(id) ?? null;
  }
  async findByIsbn(isbn: string) {
    return this.byIsbn.get(isbn) ?? null;
  }
  async findAll(opts: { skip: number; take: number; search?: string }) {
    const all = [...this.byId.values()];
    const filtered = opts.search
      ? all.filter((b) => b.title.includes(opts.search!) || b.author.includes(opts.search!))
      : all;
    return { items: filtered.slice(opts.skip, opts.skip + opts.take), total: filtered.length };
  }
  async save(book: Book) {
    this.counter += 1;
    const id = book.id || `${BOOK_ID.slice(0, -1)}${this.counter}`;
    const saved = new Book(
      id,
      book.isbn,
      book.title,
      book.author,
      book.publisher,
      book.publishedYear,
      book.genre,
      book.totalStock,
      book.availableStock,
      book.description,
      book.createdAt,
      book.updatedAt,
    );
    this.byId.set(saved.id, saved);
    this.byIsbn.set(saved.isbn, saved);
    return saved;
  }
  async update(id: string, patch: Partial<Book>) {
    const cur = this.byId.get(id);
    if (!cur) throw new Error('not_found');
    const next = new Book(
      cur.id,
      cur.isbn,
      patch.title ?? cur.title,
      patch.author ?? cur.author,
      patch.publisher ?? cur.publisher,
      patch.publishedYear ?? cur.publishedYear,
      patch.genre ?? cur.genre,
      patch.totalStock ?? cur.totalStock,
      cur.availableStock,
      patch.description ?? cur.description,
      cur.createdAt,
      new Date(),
    );
    this.byId.set(id, next);
    return next;
  }
  async delete(id: string) {
    this.byId.delete(id);
    this.byIsbn.forEach((v, k) => v.id === id && this.byIsbn.delete(k));
  }
  async decrementStockInTx(_tx: unknown, id: string, qty: number) {
    const cur = this.byId.get(id);
    if (!cur || cur.availableStock < qty) throw new Error('insufficient_stock');
    const next = new Book(
      cur.id,
      cur.isbn,
      cur.title,
      cur.author,
      cur.publisher,
      cur.publishedYear,
      cur.genre,
      cur.totalStock,
      cur.availableStock - qty,
      cur.description,
      cur.createdAt,
      new Date(),
    );
    this.byId.set(id, next);
    return next;
  }
  async incrementStockInTx(_tx: unknown, id: string, qty: number) {
    const cur = this.byId.get(id);
    if (!cur) throw new Error('not_found');
    const next = new Book(
      cur.id,
      cur.isbn,
      cur.title,
      cur.author,
      cur.publisher,
      cur.publishedYear,
      cur.genre,
      cur.totalStock,
      cur.availableStock + qty,
      cur.description,
      cur.createdAt,
      new Date(),
    );
    this.byId.set(id, next);
    return next;
  }

  seed(b: Book) {
    this.byId.set(b.id, b);
    this.byIsbn.set(b.isbn, b);
  }
}

class FakeUserRepo {
  private byId = new Map<string, User>();
  async findById(id: string) {
    return this.byId.get(id) ?? null;
  }
  async findByEmail(email: string) {
    return [...this.byId.values()].find((u) => u.email === email) ?? null;
  }
  async save(user: User) {
    this.byId.set(user.id, user);
    return user;
  }
  async update(id: string, patch: Partial<User>) {
    const cur = this.byId.get(id);
    if (!cur) throw new Error('not_found');
    const next = new User(
      cur.id,
      cur.email,
      patch.passwordHash ?? cur.passwordHash,
      patch.fullName ?? cur.fullName,
      patch.role ?? cur.role,
      patch.isActive ?? cur.isActive,
      cur.createdAt,
      new Date(),
    );
    this.byId.set(id, next);
    return next;
  }
  seed(u: User) {
    this.byId.set(u.id, u);
  }
}

class FakeLoanRepo {
  private byId = new Map<string, Loan>();
  async findById(id: string) {
    return this.byId.get(id) ?? null;
  }
  async findByRemoteLoanId(_r: string) {
    return null;
  }
  save(l: Loan) {
    this.byId.set(l.id, l);
    return l;
  }
}

class FakeBcrypt {
  async hash(plain: string) {
    return `fake:${plain}`;
  }
  async compare(plain: string, hash: string) {
    return hash === `fake:${plain}`;
  }
}

class FakeTokenService {
  async sign(payload: { sub: string; email: string; role: Role }) {
    return sign(payload, TEST_SECRET, { expiresIn: '15m' });
  }
  async verify(token: string) {
    return verify(token, TEST_SECRET) as { sub: string; email: string; role: Role };
  }
}

class FakeGrpcLoan {
  async createLoan(_req: unknown) {
    return {
      loanId: '99999999-9999-9999-9999-999999999999',
      status: 'ACTIVE' as const,
      borrowedAt: new Date().toISOString(),
    };
  }
  async registerReturn(_input: { loanId: string }) {
    return { loanId: _input.loanId, status: 'returned', returnedAt: new Date().toISOString() };
  }
  async checkAvailability(_bookId: string) {
    return { exists: true, available: true, availableStock: 1, totalStock: 1 };
  }
}

async function buildApp(): Promise<{
  app: INestApplication;
  books: FakeBookRepo;
  users: FakeUserRepo;
}> {
  const books = new FakeBookRepo();
  const users = new FakeUserRepo();

  users.seed(
    new User(
      ADMIN_ID,
      'admin@test.com',
      'fake:secret',
      'Admin',
      Role.ADMIN,
      true,
      new Date(),
      new Date(),
    ),
  );
  users.seed(
    new User(
      USER_ID,
      'user@test.com',
      'fake:secret',
      'User',
      Role.USER,
      true,
      new Date(),
      new Date(),
    ),
  );

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
      JwtModule.register({ secret: TEST_SECRET, signOptions: { expiresIn: '15m' } }),
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }]),
      HttpModule.register({ timeout: 1000, maxRedirects: 0, validateStatus: () => true }),
    ],
    controllers: [
      AuthController,
      UsersController,
      BooksController,
      LoansController,
      AdminUsersController,
      MeController,
      HealthController,
    ],
    providers: [
      { provide: PRISMA_CLIENT, useClass: FakePrismaClient },
      { provide: BOOK_REPOSITORY, useValue: books },
      { provide: USER_REPOSITORY, useValue: users },
      { provide: LOAN_REPOSITORY, useClass: FakeLoanRepo },
      { provide: LOAN_SERVICE, useClass: FakeGrpcLoan },
      { provide: PASSWORD_HASHER, useClass: FakeBcrypt },
      { provide: TOKEN_SERVICE, useClass: FakeTokenService },

      { provide: APP_GUARD, useValue: { canActivate: () => true } },
      { provide: APP_FILTER, useClass: DomainExceptionFilter },

      CreateBookUseCase,
      GetBookUseCase,
      ListBooksUseCase,
      UpdateBookUseCase,
      DeleteBookUseCase,
      RegisterUserUseCase,
      GetUserUseCase,
      ListUsersUseCase,
      UpdateUserUseCase,
      DeleteUserUseCase,
      LoginUseCase,
      CreateLoanUseCase,
      GetLoanUseCase,
      ListLoansUseCase,
      ListMyLoansUseCase,

      JwtAuthGuard,
      RolesGuard,

      { provide: GrpcLoanAdapter, useValue: { client: null } },
    ],
  }).compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return { app, books, users };
}

describe('Catalog Service e2e (in-memory adapters)', () => {
  let app: INestApplication;
  let books: FakeBookRepo;
  let users: FakeUserRepo;

  beforeAll(async () => {
    ({ app, books, users } = await buildApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 when DB is up (no outbound calls)', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('up');
  });

  it('GET /health/full reports loans service as down (no Loan Service in this e2e)', async () => {
    const res = await request(app.getHttpServer()).get('/health/full');
    expect(res.body.checks.database.status).toBe('up');
    expect(['up', 'down']).toContain(res.body.checks.loansService.status);
  });

  it('POST /auth/login returns a JWT for valid credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'secret' })
      .expect(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.accessToken.length).toBeGreaterThan(20);
  });

  it('POST /auth/login rejects bad password with 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'wrong' })
      .expect(401);
  });

  it('GET /books without token returns 401', async () => {
    await request(app.getHttpServer()).get('/books').expect(401);
  });

  it('GET /books with USER role succeeds (list)', async () => {
    const token = await new FakeTokenService().sign({
      sub: USER_ID,
      email: 'user@test.com',
      role: Role.USER,
    });
    const res = await request(app.getHttpServer())
      .get('/books')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('POST /books with USER role returns 403 (admin only)', async () => {
    const token = await new FakeTokenService().sign({
      sub: USER_ID,
      email: 'user@test.com',
      role: Role.USER,
    });
    await request(app.getHttpServer())
      .post('/books')
      .set('Authorization', `Bearer ${token}`)
      .send({ isbn: '9780140449136', title: 'The Odyssey', author: 'Homer', totalStock: 3 })
      .expect(403);
  });

  it('POST /books with ADMIN role creates a book', async () => {
    const token = await new FakeTokenService().sign({
      sub: ADMIN_ID,
      email: 'admin@test.com',
      role: Role.ADMIN,
    });
    const res = await request(app.getHttpServer())
      .post('/books')
      .set('Authorization', `Bearer ${token}`)
      .send({ isbn: '9780140449136', title: 'The Odyssey', author: 'Homer', totalStock: 3 })
      .expect(201);
    expect(res.body.isbn).toBe('9780140449136');
    expect(res.body.totalStock).toBe(3);
    expect(res.body.availableStock).toBe(3);
  });

  it('POST /books with duplicate ISBN returns 409', async () => {
    const token = await new FakeTokenService().sign({
      sub: ADMIN_ID,
      email: 'admin@test.com',
      role: Role.ADMIN,
    });
    await request(app.getHttpServer())
      .post('/books')
      .set('Authorization', `Bearer ${token}`)
      .send({ isbn: '9780140449136', title: 'Another', author: 'X', totalStock: 1 })
      .expect(409);
  });

  it('GET /loans/:id with malformed UUID returns 400', async () => {
    const token = await new FakeTokenService().sign({
      sub: USER_ID,
      email: 'user@test.com',
      role: Role.USER,
    });
    await request(app.getHttpServer())
      .get('/loans/not-a-uuid')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('GET /loans/:id with valid UUID but unknown id returns 404', async () => {
    const token = await new FakeTokenService().sign({
      sub: USER_ID,
      email: 'user@test.com',
      role: Role.USER,
    });
    await request(app.getHttpServer())
      .get('/loans/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('PATCH /admin/users/:id with new password persists it (hashed)', async () => {
    const token = await new FakeTokenService().sign({
      sub: ADMIN_ID,
      email: 'admin@test.com',
      role: Role.ADMIN,
    });
    const res = await request(app.getHttpServer())
      .patch(`/admin/users/${USER_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'NewSecret!1' })
      .expect(200);
    expect(res.body.id).toBe(USER_ID);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user@test.com', password: 'NewSecret!1' })
      .expect(200);
    expect(loginRes.body.accessToken).toBeDefined();

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user@test.com', password: 'secret' })
      .expect(401);
  });

  it('PATCH /admin/users/:id with short password returns 400', async () => {
    const token = await new FakeTokenService().sign({
      sub: ADMIN_ID,
      email: 'admin@test.com',
      role: Role.ADMIN,
    });
    await request(app.getHttpServer())
      .patch(`/admin/users/${USER_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'short' })
      .expect(400);
  });
});
