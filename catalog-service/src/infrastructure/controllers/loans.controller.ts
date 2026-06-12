import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  Headers,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../adapters/security/jwt-auth.guard';
import { RolesGuard } from '../adapters/security/roles.guard';
import { Roles } from '../adapters/security/roles.decorator';
import { Role } from '../../shared/types/role.enum';
import { CurrentUser } from '../decorators/current-user.decorator';
import { TokenPayload } from '../../domain/ports/token-service.port';
import { CreateLoanDto, ListLoansQueryDto } from '../../application/dtos/loan.dto';
import { CreateLoanUseCase } from '../../application/use-cases/loans/create-loan.usecase';
import { GetLoanUseCase } from '../../application/use-cases/loans/get-loan.usecase';
import { ListLoansUseCase } from '../../application/use-cases/loans/list-loans.usecase';
import { ListMyLoansUseCase } from '../../application/use-cases/loans/list-my-loans.usecase';
import { toLoanResponse, LoanResponseDto } from '../../application/mappers/loan.mapper';

@ApiTags('loans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('loans')
export class LoansController {
  constructor(
    private readonly createLoan: CreateLoanUseCase,
    private readonly getLoan: GetLoanUseCase,
    private readonly listLoans: ListLoansUseCase,
    private readonly listMine: ListMyLoansUseCase,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.USER)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Create a loan (saga: decrement stock locally + call Loan Service; rollback on failure)',
  })
  @ApiResponse({ status: 201, type: Object })
  @ApiResponse({ status: 404, description: 'Book or user not found' })
  @ApiResponse({ status: 409, description: 'Insufficient stock' })
  @ApiResponse({ status: 503, description: 'Loan Service unavailable; stock was reverted' })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Client-supplied dedup key' })
  async create(
    @CurrentUser() user: TokenPayload,
    @Body() dto: CreateLoanDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<LoanResponseDto> {
    const headerKey = idempotencyKey?.trim();
    const bodyKey = dto.idempotencyKey?.trim();
    const key = headerKey || bodyKey || undefined;
    const loan = await this.createLoan.execute({
      userId: user.sub,
      bookId: dto.bookId,
      idempotencyKey: key,
    });
    return toLoanResponse(loan);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List all loans (admin only). For self, use /me/loans.' })
  @ApiResponse({ status: 200, type: Object })
  async list(@Query() q: ListLoansQueryDto) {
    return this.listLoans.execute({
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 20,
      status: q.status,
      userId: q.userId,
      bookId: q.bookId,
    });
  }

  @Get('active')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Active loans for the authenticated user' })
  @ApiResponse({ status: 200, type: Object })
  async listMyActive(@CurrentUser() user: TokenPayload, @Query() q: ListLoansQueryDto) {
    return this.listMine.execute({
      userId: user.sub,
      status: 'ACTIVE',
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 20,
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Get a loan by id (local shadow)' })
  @ApiResponse({ status: 200, type: Object })
  @ApiResponse({ status: 404, description: 'Loan not found' })
  async getOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<LoanResponseDto> {
    return this.getLoan.execute(id);
  }
}
