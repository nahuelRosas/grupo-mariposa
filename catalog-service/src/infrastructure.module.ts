import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { HttpModule } from '@nestjs/axios';
import { PrismaClient } from '@prisma/client';

import {
  BOOK_REPOSITORY,
  LOAN_REPOSITORY,
  LOAN_SERVICE,
  PASSWORD_HASHER,
  PRISMA_CLIENT,
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from './shared/di-tokens/tokens';
import { PrismaBookRepository } from './infrastructure/adapters/persistence/prisma-book.repository';
import { PrismaUserRepository } from './infrastructure/adapters/persistence/prisma-user.repository';
import { PrismaLoanRepository } from './infrastructure/adapters/persistence/prisma-loan.repository';
import { HttpLoanAdapter } from './infrastructure/adapters/http/http-loan.adapter';
import { GrpcLoanAdapter } from './infrastructure/adapters/grpc/grpc-loan.adapter';
import { BcryptPasswordHasher } from './infrastructure/adapters/security/bcrypt-password-hasher';
import { JwtTokenService } from './infrastructure/adapters/security/jwt-token.service';
import { JwtAuthGuard } from './infrastructure/adapters/security/jwt-auth.guard';
import { RolesGuard } from './infrastructure/adapters/security/roles.guard';
import { AuthController, UsersController } from './infrastructure/controllers/auth.controller';
import { BooksController } from './infrastructure/controllers/books.controller';
import { LoansController } from './infrastructure/controllers/loans.controller';
import { InternalBooksController } from './infrastructure/controllers/internal-books.controller';
import { AdminUsersController } from './infrastructure/controllers/users.controller';
import { MeController } from './infrastructure/controllers/me.controller';
import { HealthController } from './infrastructure/adapters/health/health.controller';
import { DomainExceptionFilter } from './infrastructure/filters/domain-exception.filter';
import { LoginUseCase } from './application/use-cases/auth/login.usecase';
import { CreateBookUseCase } from './application/use-cases/books/create-book.usecase';
import { DeleteBookUseCase } from './application/use-cases/books/delete-book.usecase';
import { GetBookUseCase } from './application/use-cases/books/get-book.usecase';
import { ListBooksUseCase } from './application/use-cases/books/list-books.usecase';
import { UpdateBookUseCase } from './application/use-cases/books/update-book.usecase';
import { CreateLoanUseCase } from './application/use-cases/loans/create-loan.usecase';
import { GetLoanUseCase } from './application/use-cases/loans/get-loan.usecase';
import { ListLoansUseCase } from './application/use-cases/loans/list-loans.usecase';
import { ListMyLoansUseCase } from './application/use-cases/loans/list-my-loans.usecase';
import { DeleteUserUseCase } from './application/use-cases/users/delete-user.usecase';
import { GetUserUseCase } from './application/use-cases/users/get-user.usecase';
import { ListUsersUseCase } from './application/use-cases/users/list-users.usecase';
import { RegisterUserUseCase } from './application/use-cases/users/register-user.usecase';
import { UpdateUserUseCase } from './application/use-cases/users/update-user.usecase';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        timeout: config.get<number>('loansService.timeoutMs') ?? 3000,
        maxRedirects: 0,
        validateStatus: () => true,
      }),
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: { expiresIn: config.get<string>('jwt.expiresIn') ?? '1h' },
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('throttler.ttl') ?? 60_000,
          limit: config.get<number>('throttler.limit') ?? 100,
        },
      ],
    }),
  ],
  controllers: [
    AuthController,
    UsersController,
    InternalBooksController,
    BooksController,
    LoansController,
    AdminUsersController,
    MeController,
    HealthController,
  ],
  providers: [
    {
      provide: PRISMA_CLIENT,
      useFactory: () => new PrismaClient(),
    },
    { provide: BOOK_REPOSITORY, useClass: PrismaBookRepository },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: LOAN_REPOSITORY, useClass: PrismaLoanRepository },
    {
      provide: LOAN_SERVICE,
      useFactory: (cfg: ConfigService, http: HttpLoanAdapter, grpc: GrpcLoanAdapter) =>
        (cfg.get<string>('loansService.transport') ?? 'http') === 'grpc' ? grpc : http,
      inject: [ConfigService, HttpLoanAdapter, GrpcLoanAdapter],
    },
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    JwtAuthGuard,
    RolesGuard,
    HttpLoanAdapter,
    GrpcLoanAdapter,
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
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
  exports: [PRISMA_CLIENT, HttpLoanAdapter, GrpcLoanAdapter],
})
export class InfrastructureModule {}
