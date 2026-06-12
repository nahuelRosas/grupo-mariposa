import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AxiosError, isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  AvailabilityResponse,
  CreateRemoteLoanRequest,
  CreateRemoteLoanResponse,
  LoanServicePort,
  RegisterReturnInput,
  RegisterReturnResponse,
} from '../../../domain/ports/loan-service.port';

interface BookDTO {
  id: string;
  availableStock: number;
  totalStock: number;
}

interface RemoteLoanDTO {
  id: string;
  book_id: string;
  user_id: string;
  status: string;
  borrowed_at: string;
  returned_at: string | null;
}

interface RemoteReturnDTO {
  id: string;
  status: string;
  returned_at: string | null;
  message?: string;
}

@Injectable()
export class HttpLoanAdapter implements LoanServicePort, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HttpLoanAdapter.name);
  private baseUrl = '';
  private timeoutMs = 3000;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  onModuleInit(): void {
    this.baseUrl = this.config.getOrThrow<string>('loansService.baseUrl');
    this.timeoutMs = this.config.get<number>('loansService.timeoutMs') ?? 3000;
    this.logger.log(`HTTP loan client ready url=${this.baseUrl} timeout=${this.timeoutMs}ms`);
  }

  async onModuleDestroy(): Promise<void> {}

  async createLoan(req: CreateRemoteLoanRequest): Promise<CreateRemoteLoanResponse> {
    try {
      const { data } = await firstValueFrom(
        this.http.post<RemoteLoanDTO>(
          `${this.baseUrl}/loans`,
          {
            book_id: req.bookId,
            user_id: req.userId,
            idempotency_key: req.idempotencyKey,
          },
          { timeout: this.timeoutMs },
        ),
      );
      if (!data?.id) {
        throw this.mapInvalidResponse('createLoan');
      }
      return {
        loanId: data.id,
        status: (data.status === 'active' ? 'ACTIVE' : 'PENDING') as 'ACTIVE' | 'PENDING',
        borrowedAt: data.borrowed_at ?? new Date().toISOString(),
      };
    } catch (err) {
      throw this.mapHttpError(err, 'createLoan');
    }
  }

  async registerReturn(input: RegisterReturnInput): Promise<RegisterReturnResponse> {
    try {
      const { data } = await firstValueFrom(
        this.http.post<RemoteReturnDTO>(
          `${this.baseUrl}/loans/${input.loanId}/return`,
          {},
          { timeout: this.timeoutMs },
        ),
      );
      return {
        loanId: data.id,
        status: data.status,
        returnedAt: data.returned_at ?? new Date().toISOString(),
        message: data.message,
      };
    } catch (err) {
      throw this.mapHttpError(err, 'registerReturn');
    }
  }

  async checkAvailability(bookId: string): Promise<AvailabilityResponse> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<BookDTO>(`${this.baseUrl}/availability/${bookId}`, {
          timeout: this.timeoutMs,
        }),
      );
      const existsFlag =
        typeof (data as unknown as { exists?: boolean } | undefined)?.exists === 'boolean'
          ? (data as unknown as { exists: boolean }).exists
          : Boolean(data?.id);
      return {
        exists: existsFlag,
        available: (data?.availableStock ?? 0) > 0,
        availableStock: data?.availableStock ?? 0,
        totalStock: data?.totalStock ?? 0,
      };
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 404) {
        return { exists: false, available: false, availableStock: 0, totalStock: 0 };
      }
      throw this.mapHttpError(err, 'checkAvailability');
    }
  }

  private mapHttpError(err: unknown, op: string): Error {
    if (isAxiosError(err)) {
      const ax = err as AxiosError<{ code?: string; message?: string }>;
      const status = ax.response?.status;
      const body = ax.response?.data;
      if (ax.code === 'ECONNABORTED' || ax.code === 'ETIMEDOUT' || status === 408) {
        return new Error('loan_service_timeout');
      }
      if (status === 503) {
        return new Error('loan_service_unavailable');
      }
      if (status === 502 || status === 504) {
        return new Error('loan_service_unavailable');
      }
      if (status === 404) {
        return new Error('book_not_found_remote');
      }
      if (status === 409) {
        return new Error('book_unavailable');
      }
      this.logger.warn(`loan service ${op} failed status=${status} body=${JSON.stringify(body)}`);
      return new Error(`loan_service_error_${status ?? 'network'}`);
    }
    return err instanceof Error ? err : new Error(String(err));
  }

  private mapInvalidResponse(op: string): Error {
    this.logger.warn(`loan service ${op} returned an invalid response`);
    return new Error('loan_service_invalid_response');
  }
}
