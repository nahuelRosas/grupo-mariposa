import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { credentials, Client, status as GrpcStatus, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { existsSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import {
  AvailabilityResponse,
  CreateRemoteLoanRequest,
  CreateRemoteLoanResponse,
  LoanServicePort,
  RegisterReturnInput,
  RegisterReturnResponse,
} from '../../../domain/ports/loan-service.port';

interface RegisterLoanWire {
  book_id: string;
  user_id: string;
  idempotency_key: string;
  due_at: string;
}
interface RegisterLoanRespWire {
  loan_id: string;
  status: string;
  message: string;
  borrowed_at: string;
  due_at: string;
}

interface RegisterReturnWire {
  loan_id: string;
  returned_at: string;
}
interface RegisterReturnRespWire {
  loan_id: string;
  status: string;
  returned_at: string;
  message: string;
}

interface ValidateAvailabilityWire {
  book_id: string;
}
interface ValidateAvailabilityRespWire {
  available: boolean;
  active_loans_count: number;
  total_copies: number;
}

interface LoanServiceClient extends Client {
  RegisterLoan(
    req: RegisterLoanWire,
    opts: { deadline: number },
    cb: (err: Error | null, resp: RegisterLoanRespWire) => void,
  ): unknown;
  RegisterReturn(
    req: RegisterReturnWire,
    opts: { deadline: number },
    cb: (err: Error | null, resp: RegisterReturnRespWire) => void,
  ): unknown;
  ValidateAvailability(
    req: ValidateAvailabilityWire,
    opts: { deadline: number },
    cb: (err: Error | null, resp: ValidateAvailabilityRespWire) => void,
  ): unknown;
}

@Injectable()
export class GrpcLoanAdapter implements LoanServicePort, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GrpcLoanAdapter.name);
  private client!: LoanServiceClient;
  private timeoutMs = 3000;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.getOrThrow<string>('loansService.grpcUrl');
    this.timeoutMs = this.config.get<number>('loansService.timeoutMs') ?? 3000;

    const configured = this.config.getOrThrow<string>('loansService.protoPath');
    const protoPath = isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
    if (!existsSync(protoPath)) {
      throw new Error(
        `library.proto not found at ${protoPath}. Set GRPC_PROTO_PATH to a valid absolute path.`,
      );
    }

    const def = loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const pkg = loadPackageDefinition(def) as unknown as {
      library: { v1: { LoanService: new (target: string, creds: unknown) => LoanServiceClient } };
    };
    this.client = new pkg.library.v1.LoanService(url, credentials.createInsecure());
    this.logger.log(
      `gRPC loan client connected url=${url} timeout=${this.timeoutMs}ms proto=${protoPath}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      this.client.close();
    }
  }

  async createLoan(req: CreateRemoteLoanRequest): Promise<CreateRemoteLoanResponse> {
    const deadline = Date.now() + this.timeoutMs;
    return new Promise<CreateRemoteLoanResponse>((resolve, reject) => {
      (
        this.client as unknown as {
          RegisterLoan: (
            req: RegisterLoanWire,
            opts: { deadline: number },
            cb: (err: Error | null, resp: RegisterLoanRespWire) => void,
          ) => unknown;
        }
      ).RegisterLoan(
        {
          book_id: req.bookId,
          user_id: req.userId,
          idempotency_key: req.idempotencyKey,
          due_at: '',
        },
        { deadline },
        (err, response) => {
          if (err) return reject(this.mapGrpcErr(err));
          if (!response?.loan_id || !response?.status) {
            return reject(new Error('loan_service_invalid_response'));
          }
          resolve({
            loanId: response.loan_id,
            status: (response.status === 'active' ? 'ACTIVE' : 'PENDING') as 'ACTIVE' | 'PENDING',
            borrowedAt: response.borrowed_at ?? new Date().toISOString(),
          });
        },
      );
    });
  }

  async registerReturn(input: RegisterReturnInput): Promise<RegisterReturnResponse> {
    const deadline = Date.now() + this.timeoutMs;
    return new Promise<RegisterReturnResponse>((resolve, reject) => {
      (
        this.client as unknown as {
          RegisterReturn: (
            req: RegisterReturnWire,
            opts: { deadline: number },
            cb: (err: Error | null, resp: RegisterReturnRespWire) => void,
          ) => unknown;
        }
      ).RegisterReturn(
        { loan_id: input.loanId, returned_at: '' },
        { deadline },
        (err, response) => {
          if (err) return reject(this.mapGrpcErr(err));
          resolve({
            loanId: response.loan_id,
            status: response.status,
            returnedAt: response.returned_at ?? new Date().toISOString(),
            message: response.message,
          });
        },
      );
    });
  }

  async checkAvailability(bookId: string): Promise<AvailabilityResponse> {
    const deadline = Date.now() + this.timeoutMs;
    return new Promise<AvailabilityResponse>((resolve, reject) => {
      (
        this.client as unknown as {
          ValidateAvailability: (
            req: ValidateAvailabilityWire,
            opts: { deadline: number },
            cb: (err: Error | null, resp: ValidateAvailabilityRespWire) => void,
          ) => unknown;
        }
      ).ValidateAvailability({ book_id: bookId }, { deadline }, (err, response) => {
        if (err) return reject(this.mapGrpcErr(err));
        resolve({
          exists: response?.total_copies !== 0 || response?.active_loans_count !== 0,
          available: Boolean(response?.available),
          availableStock: response?.total_copies
            ? Math.max(0, response.total_copies - response.active_loans_count)
            : 0,
          totalStock: response?.total_copies ?? 0,
        });
      });
    });
  }

  private mapGrpcErr(err: Error): Error {
    const code = (err as unknown as { code?: number }).code;
    if (code === GrpcStatus.DEADLINE_EXCEEDED) return new Error('loan_service_timeout');
    if (code === GrpcStatus.UNAVAILABLE) return new Error('loan_service_unavailable');
    if (code === GrpcStatus.NOT_FOUND) return new Error('book_not_found_remote');
    if (code === GrpcStatus.RESOURCE_EXHAUSTED) return new Error('book_unavailable');
    return err;
  }
}
