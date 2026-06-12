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
import { HttpLoanAdapter } from '../src/infrastructure/adapters/http/http-loan.adapter';
import { GrpcLoanAdapter } from '../src/infrastructure/adapters/grpc/grpc-loan.adapter';
import { Role } from '../src/shared/types/role.enum';
import { ConfigModule } from '@nestjs/config';
import configuration from '../src/shared/config/configuration';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HttpModule } from '@nestjs/axios';
import { Book } from '../src/domain/entities/book.entity';
import { User } from '../src/domain/entities/user.entity';
import { Loan } from '../src/domain/entities/loan.entity';

const TEST_SECRET = 'http-e2e-test-secret-32-bytes-minimum-please-yes';
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const BOOK_ID = '33333333-3333-4333-8333-333333333333';

class FakePrismaClient {
  async $queryRaw(): Promise<unknown> {
    return [{ '?column?': 1 }];
  }
  loan = {
    create: async () => ({ id: 'pending-loan-id' }),
    update: async ({ where, data }: any) => ({
      id: where.id,
      remoteLoanId: data.remoteLoanId ?? null,
      userId: '00000000-0000-0000-0000-000000000000',
      bookId: '00000000-0000-0000-0000-000000000000',
      status: data.status ?? 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    updateMany: async () => ({ count: 1 }),
  };
  book = {
    update: async () => ({}),
  };
  async $transaction(arg: any) {
    if (typeof arg === 'function') {
      return arg({
        book: this.book,
        loan: this.loan,
      });
    }
    return arg;
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

class FakeHttpLoan {
  calls: { method: string; payload?: any }[] = [];

  nextCreate?:
    | { ok: true; loanId: string; status: 'ACTIVE' | 'PENDING' }
    | { ok: false; err: Error };
  nextAvailability?: {
    exists: boolean;
    available: boolean;
    availableStock: number;
    totalStock: number;
  };
  nextReturn?: { loanId: string; status: string };

  async createLoan(req: { userId: string; bookId: string; idempotencyKey: string }) {
    this.calls.push({ method: 'createLoan', payload: req });
    if (this.nextCreate && 'ok' in this.nextCreate && !this.nextCreate.ok) {
      throw (this.nextCreate as any).err;
    }
    const c = this.nextCreate as any;
    return {
      loanId: c.loanId,
      status: c.status,
      borrowedAt: new Date().toISOString(),
    };
  }
  async registerReturn(input: { loanId: string }) {
    this.calls.push({ method: 'registerReturn', payload: input });
    return {
      loanId: input.loanId,
      status: this.nextReturn?.status ?? 'returned',
      returnedAt: new Date().toISOString(),
    };
  }
  async checkAvailability(bookId: string) {
    this.calls.push({ method: 'checkAvailability', payload: { bookId } });
    return (
      this.nextAvailability ?? { exists: true, available: true, availableStock: 1, totalStock: 1 }
    );
  }
}

async function buildApp(fakeHttp: FakeHttpLoan) {
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
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
      HttpModule.register({ timeout: 1000, maxRedirects: 0 }),
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
      { provide: LOAN_SERVICE, useValue: fakeHttp },
      { provide: PASSWORD_HASHER, useClass: FakeBcrypt },
      { provide: TOKEN_SERVICE, useClass: FakeTokenService },
      { provide: HttpLoanAdapter, useValue: { client: null } },
      { provide: GrpcLoanAdapter, useValue: { client: null } },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
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
    ],
  }).compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return { app, books, users };
}

describe('HttpLoanAdapter (the spec-mandated A->B transport)', () => {
  let app: INestApplication;
  let books: FakeBookRepo;
  let users: FakeUserRepo;
  let fakeHttp: FakeHttpLoan;

  beforeAll(async () => {
    fakeHttp = new FakeHttpLoan();
    ({ app, books, users } = await buildApp(fakeHttp));
  });

  afterAll(async () => {
    await app.close();
  });

  it('happy path: book exists, stock available, B returns ACTIVE', async () => {
    fakeHttp.nextCreate = {
      ok: true,
      loanId: '99999999-9999-9999-9999-999999999999',
      status: 'ACTIVE',
    };
    fakeHttp.nextAvailability = { exists: true, available: true, availableStock: 1, totalStock: 1 };

    const book = new Book(
      BOOK_ID,
      '978-0-13-468599-1',
      'Pragmatic',
      'Hunt',
      null,
      null,
      null,
      1,
      1,
      null,
      new Date(),
      new Date(),
    );
    books.seed(book);

    const token = await new FakeTokenService().sign({
      sub: USER_ID,
      email: 'user@test.com',
      role: Role.USER,
    });
    const res = await request(app.getHttpServer())
      .post('/loans')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookId: BOOK_ID });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.remoteLoanId).toBe('99999999-9999-9999-9999-999999999999');
    const checkCalls = fakeHttp.calls.filter((c) => c.method === 'checkAvailability').length;
    const createCalls = fakeHttp.calls.filter((c) => c.method === 'createLoan').length;
    expect(checkCalls).toBe(1);
    expect(createCalls).toBe(1);
  });

  it('book not in catalog -> 404, no gRPC/HTTP call to B for create', async () => {
    fakeHttp.calls = [];
    fakeHttp.nextCreate = { ok: true, loanId: 'irrelevant', status: 'ACTIVE' };
    fakeHttp.nextAvailability = {
      exists: false,
      available: false,
      availableStock: 0,
      totalStock: 0,
    };

    const book = new Book(
      BOOK_ID,
      '978-0-13-468599-2',
      'Pragmatic 2',
      'Hunt',
      null,
      null,
      null,
      1,
      1,
      null,
      new Date(),
      new Date(),
    );
    books.seed(book);

    const token = await new FakeTokenService().sign({
      sub: USER_ID,
      email: 'user@test.com',
      role: Role.USER,
    });
    const res = await request(app.getHttpServer())
      .post('/loans')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookId: BOOK_ID });
    expect(res.status).toBe(404);

    const createCalls = fakeHttp.calls.filter((c) => c.method === 'createLoan').length;
    expect(createCalls).toBe(0);
  });

  it('B unreachable -> 503, stock rolled back', async () => {
    fakeHttp.calls = [];
    fakeHttp.nextCreate = { ok: false, err: new Error('loan_service_unavailable') };
    fakeHttp.nextAvailability = { exists: true, available: true, availableStock: 1, totalStock: 1 };

    const book = new Book(
      BOOK_ID,
      '978-0-13-468599-3',
      'Pragmatic 3',
      'Hunt',
      null,
      null,
      null,
      1,
      1,
      null,
      new Date(),
      new Date(),
    );
    books.seed(book);

    const token = await new FakeTokenService().sign({
      sub: USER_ID,
      email: 'user@test.com',
      role: Role.USER,
    });
    const res = await request(app.getHttpServer())
      .post('/loans')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookId: BOOK_ID });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('loan_service_unavailable');

    const after = await books.findById(BOOK_ID);
    expect(after?.availableStock).toBe(1);
  });

  it('POST /loans is rate-limited at 20/min', async () => {
    fakeHttp.nextCreate = { ok: true, loanId: 'rate-loan-id', status: 'ACTIVE' };
    fakeHttp.nextAvailability = { exists: true, available: true, availableStock: 1, totalStock: 1 };
    fakeHttp.nextReturn = { loanId: 'x', status: 'returned' };

    const book = new Book(
      BOOK_ID,
      '978-0-13-468599-4',
      'Pragmatic 4',
      'Hunt',
      null,
      null,
      null,
      50,
      50,
      null,
      new Date(),
      new Date(),
    );
    books.seed(book);

    const token = await new FakeTokenService().sign({
      sub: USER_ID,
      email: 'user@test.com',
      role: Role.USER,
    });
    let lastStatus = 0;
    let firstRateLimited = 0;
    for (let i = 0; i < 25; i++) {
      const res = await request(app.getHttpServer())
        .post('/loans')
        .set('Authorization', `Bearer ${token}`)
        .send({ bookId: BOOK_ID });
      lastStatus = res.status;
      if (res.status === 429 && firstRateLimited === 0) {
        firstRateLimited = i + 1;
      }
    }
    expect(lastStatus).toBe(429);
    expect(firstRateLimited).toBeGreaterThan(0);
    expect(firstRateLimited).toBeLessThanOrEqual(21);
  });
});
