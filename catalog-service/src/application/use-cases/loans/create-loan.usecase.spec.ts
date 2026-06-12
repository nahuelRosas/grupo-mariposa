import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { CreateLoanUseCase } from './create-loan.usecase';
import { Book } from '../../../domain/entities/book.entity';
import { User } from '../../../domain/entities/user.entity';
import { Role } from '../../../shared/types/role.enum';
import { BookNotFoundException } from '../../../domain/exceptions/book-not-found.exception';
import { UserNotFoundException } from '../../../domain/exceptions/user-not-found.exception';
import { InsufficientStockException } from '../../../domain/exceptions/insufficient-stock.exception';
import { LoanServiceUnavailableException } from '../../../domain/exceptions/loan-service-unavailable.exception';
import {
  BOOK_REPOSITORY,
  LOAN_SERVICE,
  PRISMA_CLIENT,
  USER_REPOSITORY,
} from '../../../shared/di-tokens/tokens';

class FakeBookRepo {
  findById = jest.fn();
  findByIsbn = jest.fn();
  findAll = jest.fn();
  save = jest.fn();
  update = jest.fn();
  delete = jest.fn();
  decrementStockInTx = jest.fn();
  incrementStockInTx = jest.fn();
}

class FakeUserRepo {
  findById = jest.fn();
  findByEmail = jest.fn();
  create = jest.fn();
}

class FakeLoanService {
  createLoan = jest.fn();
}

class FakePrisma {
  $transaction = jest.fn();
  loan = {
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
}

function makeBook(over: Partial<Book> = {}): Book {
  return new Book(
    over.id ?? randomUUID(),
    over.isbn ?? '9780000000001',
    over.title ?? 'Some Book',
    over.author ?? 'Author',
    over.publisher ?? null,
    over.publishedYear ?? null,
    over.genre ?? null,
    over.totalStock ?? 5,
    over.availableStock ?? 1,
    over.description ?? null,
    new Date(),
    new Date(),
  );
}

function makeUser(over: Partial<User> = {}): User {
  return new User(
    over.id ?? randomUUID(),
    over.email ?? 'user@example.com',
    over.passwordHash ?? 'hash',
    over.fullName ?? 'User',
    over.role ?? Role.USER,
    over.isActive ?? true,
    new Date(),
    new Date(),
  );
}

async function buildUseCase() {
  const bookRepo = new FakeBookRepo();
  const userRepo = new FakeUserRepo();
  const loanService = new FakeLoanService();
  const prisma = new FakePrisma();
  const mod = await Test.createTestingModule({
    providers: [
      CreateLoanUseCase,
      { provide: BOOK_REPOSITORY, useValue: bookRepo },
      { provide: USER_REPOSITORY, useValue: userRepo },
      { provide: LOAN_SERVICE, useValue: loanService },
      { provide: PRISMA_CLIENT, useValue: prisma },
    ],
  }).compile();
  return { useCase: mod.get(CreateLoanUseCase), bookRepo, userRepo, loanService, prisma };
}

describe('CreateLoanUseCase (saga)', () => {
  it('happy path: decrement + gRPC + finalize', async () => {
    const { useCase, bookRepo, userRepo, loanService, prisma } = await buildUseCase();
    const book = makeBook({ availableStock: 1 });
    const user = makeUser();

    bookRepo.findById.mockResolvedValue(book);
    userRepo.findById.mockResolvedValue(user);

    const pendingId = randomUUID();
    prisma.$transaction.mockImplementationOnce(async (fn) => {
      const tx = {
        book: { update: () => ({}) },
        loan: { create: jest.fn().mockResolvedValue({ id: pendingId }) },
      };
      bookRepo.decrementStockInTx.mockResolvedValue(makeBook({ availableStock: 0 }));
      return fn(tx);
    });

    const remoteLoanId = randomUUID();
    loanService.createLoan.mockResolvedValue({
      loanId: remoteLoanId,
      status: 'ACTIVE',
      borrowedAt: new Date().toISOString(),
    });

    prisma.loan.update.mockResolvedValue({
      id: pendingId,
      remoteLoanId,
      userId: user.id,
      bookId: book.id,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const loan = await useCase.execute({ userId: user.id, bookId: book.id });

    expect(loan.status).toBe('ACTIVE');
    expect(loan.remoteLoanId).toBe(remoteLoanId);
    expect(loanService.createLoan).toHaveBeenCalledTimes(1);
    expect(prisma.loan.update).toHaveBeenCalledWith({
      where: { id: pendingId },
      data: { remoteLoanId: remoteLoanId, status: 'ACTIVE' },
    });
  });

  it('pre-validation: book not found -> no side effects', async () => {
    const { useCase, bookRepo, userRepo, loanService, prisma } = await buildUseCase();
    const user = makeUser();
    bookRepo.findById.mockResolvedValue(null);
    userRepo.findById.mockResolvedValue(user);

    await expect(useCase.execute({ userId: user.id, bookId: 'nope' })).rejects.toBeInstanceOf(
      BookNotFoundException,
    );
    expect(loanService.createLoan).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('pre-validation: user not found -> no side effects', async () => {
    const { useCase, bookRepo, userRepo, loanService, prisma } = await buildUseCase();
    const book = makeBook();
    bookRepo.findById.mockResolvedValue(book);
    userRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ userId: 'nope', bookId: book.id })).rejects.toBeInstanceOf(
      UserNotFoundException,
    );
    expect(loanService.createLoan).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('pre-validation: insufficient stock -> no side effects', async () => {
    const { useCase, bookRepo, userRepo, loanService, prisma } = await buildUseCase();
    const book = makeBook({ availableStock: 0 });
    const user = makeUser();
    bookRepo.findById.mockResolvedValue(book);
    userRepo.findById.mockResolvedValue(user);

    await expect(useCase.execute({ userId: user.id, bookId: book.id })).rejects.toBeInstanceOf(
      InsufficientStockException,
    );
    expect(loanService.createLoan).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('race: stock goes negative under tx -> InsufficientStockException, no gRPC', async () => {
    const { useCase, bookRepo, userRepo, loanService, prisma } = await buildUseCase();
    const book = makeBook({ availableStock: 1 });
    const user = makeUser();
    bookRepo.findById.mockResolvedValue(book);
    userRepo.findById.mockResolvedValue(user);

    prisma.$transaction.mockImplementationOnce(async (fn) => {
      bookRepo.decrementStockInTx.mockResolvedValue(makeBook({ availableStock: -1 }));
      const tx = { loan: { create: jest.fn() } };
      return fn(tx);
    });

    await expect(useCase.execute({ userId: user.id, bookId: book.id })).rejects.toBeInstanceOf(
      InsufficientStockException,
    );
    expect(loanService.createLoan).not.toHaveBeenCalled();
  });

  it('saga rollback: gRPC failure -> stock restored, loan ROLLED_BACK, 503-ish thrown', async () => {
    const { useCase, bookRepo, userRepo, loanService, prisma } = await buildUseCase();
    const book = makeBook({ availableStock: 1 });
    const user = makeUser();
    bookRepo.findById.mockResolvedValue(book);
    userRepo.findById.mockResolvedValue(user);

    const pendingId = randomUUID();
    prisma.$transaction
      .mockImplementationOnce(async (fn) => {
        bookRepo.decrementStockInTx.mockResolvedValue(makeBook({ availableStock: 0 }));
        const tx = { loan: { create: jest.fn().mockResolvedValue({ id: pendingId }) } };
        return fn(tx);
      })
      .mockImplementationOnce(async (fn) => {
        bookRepo.incrementStockInTx.mockResolvedValue(makeBook({ availableStock: 1 }));
        const tx = {
          loan: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        };
        return fn(tx);
      });

    loanService.createLoan.mockRejectedValue(new Error('grpc_unavailable'));

    await expect(useCase.execute({ userId: user.id, bookId: book.id })).rejects.toBeInstanceOf(
      LoanServiceUnavailableException,
    );
    expect(bookRepo.incrementStockInTx).toHaveBeenCalledTimes(1);
    expect(prisma.loan.update).not.toHaveBeenCalled();
  });

  it('saga rollback: gRPC fails AND compensation fails -> still throws LoanServiceUnavailableException', async () => {
    const { useCase, bookRepo, userRepo, loanService, prisma } = await buildUseCase();
    const book = makeBook({ availableStock: 1 });
    const user = makeUser();
    bookRepo.findById.mockResolvedValue(book);
    userRepo.findById.mockResolvedValue(user);

    const pendingId = randomUUID();
    prisma.$transaction
      .mockImplementationOnce(async (fn) => {
        bookRepo.decrementStockInTx.mockResolvedValue(makeBook({ availableStock: 0 }));
        const tx = { loan: { create: jest.fn().mockResolvedValue({ id: pendingId }) } };
        return fn(tx);
      })
      .mockImplementationOnce(async () => {
        bookRepo.incrementStockInTx.mockRejectedValue(new Error('db_dead'));
        throw new Error('db_dead');
      });

    loanService.createLoan.mockRejectedValue(new Error('grpc_unavailable'));

    await expect(useCase.execute({ userId: user.id, bookId: book.id })).rejects.toBeInstanceOf(
      LoanServiceUnavailableException,
    );
  });

  it('DB down in step 1 -> throws the underlying error, no decrement applied', async () => {
    const { useCase, bookRepo, userRepo, loanService, prisma } = await buildUseCase();
    const book = makeBook({ availableStock: 1 });
    const user = makeUser();
    bookRepo.findById.mockResolvedValue(book);
    userRepo.findById.mockResolvedValue(user);

    prisma.$transaction.mockImplementationOnce(async () => {
      throw new Error('connection refused');
    });

    await expect(useCase.execute({ userId: user.id, bookId: book.id })).rejects.toThrow(
      /connection refused/,
    );

    expect(loanService.createLoan).not.toHaveBeenCalled();
    expect(prisma.loan.update).not.toHaveBeenCalled();
  });

  it('DB error during compensation -> still throws LoanServiceUnavailableException', async () => {
    const { useCase, bookRepo, userRepo, loanService, prisma } = await buildUseCase();
    const book = makeBook({ availableStock: 1 });
    const user = makeUser();
    bookRepo.findById.mockResolvedValue(book);
    userRepo.findById.mockResolvedValue(user);

    prisma.$transaction
      .mockImplementationOnce(async (fn) => {
        bookRepo.decrementStockInTx.mockResolvedValue(makeBook({ availableStock: 0 }));
        const tx = { loan: { create: jest.fn().mockResolvedValue({ id: 'pending-id' }) } };
        return fn(tx);
      })
      .mockImplementationOnce(async () => {
        throw new Error('db_dead');
      });

    loanService.createLoan.mockRejectedValue(new Error('grpc_unavailable'));

    await expect(useCase.execute({ userId: user.id, bookId: book.id })).rejects.toBeInstanceOf(
      LoanServiceUnavailableException,
    );
  });

  it('idempotency-key from client: forwarded verbatim to the loan service', async () => {
    const { useCase, bookRepo, userRepo, loanService, prisma } = await buildUseCase();
    const book = makeBook({ availableStock: 5 });
    const user = makeUser();
    bookRepo.findById.mockResolvedValue(book);
    userRepo.findById.mockResolvedValue(user);

    const fixedKey = 'client-supplied-uuid-abc';
    const remoteId = randomUUID();

    prisma.$transaction.mockImplementationOnce(async (fn) => {
      bookRepo.decrementStockInTx.mockResolvedValue(makeBook({ availableStock: 4 }));
      const tx = { loan: { create: jest.fn().mockResolvedValue({ id: 'pending-1' }) } };
      return fn(tx);
    });
    loanService.createLoan.mockResolvedValueOnce({
      loanId: remoteId,
      status: 'ACTIVE',
      borrowedAt: new Date().toISOString(),
    });
    prisma.loan.update.mockResolvedValueOnce({
      id: 'pending-1',
      remoteLoanId: remoteId,
      userId: user.id,
      bookId: book.id,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await useCase.execute({
      userId: user.id,
      bookId: book.id,
      idempotencyKey: fixedKey,
    });

    expect(loanService.createLoan).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: fixedKey }),
    );
  });
});
