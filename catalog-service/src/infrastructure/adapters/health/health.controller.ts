import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';
import { PRISMA_CLIENT } from '../../../shared/di-tokens/tokens';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

interface SubCheck {
  status: 'up' | 'down' | 'not_checked';
  detail?: string;
}

interface HealthBody {
  status: 'ok' | 'degraded';
  db: 'up' | 'down' | 'not_checked';
  grpcLoans: 'up' | 'down' | 'not_checked';
  checks: { database: SubCheck; loansService: SubCheck };
  timestamp: string;
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthBody> {
    const database = await this.checkDatabase();
    const allUp = database.status === 'up';
    const body: HealthBody = {
      status: allUp ? 'ok' : 'degraded',
      db: database.status,
      grpcLoans: 'not_checked',
      checks: { database, loansService: { status: 'not_checked' } },
      timestamp: new Date().toISOString(),
    };
    res.status(allUp ? 200 : 503);
    return body;
  }

  @Get('full')
  async checkFull(@Res({ passthrough: true }) res: Response): Promise<HealthBody> {
    const [database, loansService] = await Promise.all([
      this.checkDatabase(),
      this.checkLoansService(),
    ]);
    const allUp = database.status === 'up' && loansService.status === 'up';
    const body: HealthBody = {
      status: allUp ? 'ok' : 'degraded',
      db: database.status,
      grpcLoans: loansService.status,
      checks: { database, loansService },
      timestamp: new Date().toISOString(),
    };
    if (!allUp) {
      this.logger.warn(`health/full degraded: db=${database.status} loans=${loansService.status}`);
    }
    res.status(allUp ? 200 : 503);
    return body;
  }

  private async checkDatabase(): Promise<SubCheck> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up' };
    } catch (e) {
      return { status: 'down', detail: (e as Error).message };
    }
  }

  private async checkLoansService(): Promise<SubCheck> {
    const base = this.config.getOrThrow<string>('loansService.baseUrl');
    try {
      const result = await firstValueFrom(
        this.http.get<{ status?: string; db?: string }>(`${base}/healthz`, { timeout: 2000 }).pipe(
          timeout({ each: 2000 }),
          catchError((err) => {
            const m =
              err instanceof Error
                ? err.name + ': ' + ((err as { code?: string }).code ?? err.message)
                : String(err);
            return of({ status: 0, data: undefined, _err: m });
          }),
        ),
      );
      const status = (result as { status: number }).status;
      const data = (result as { data: { db?: string } | undefined }).data;
      const _err = (result as { _err?: string })._err;
      if (_err) {
        return { status: 'down', detail: _err };
      }
      const ok = status === 200 && data?.db === 'up';
      return ok
        ? { status: 'up' }
        : { status: 'down', detail: `loans /healthz returned ${status}` };
    } catch (e) {
      return { status: 'down', detail: (e as Error).message };
    }
  }
}
