import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../adapters/security/jwt-auth.guard';
import { Roles } from '../adapters/security/roles.decorator';
import { Role } from '../../shared/types/role.enum';
import { CurrentUser } from '../decorators/current-user.decorator';
import { TokenPayload } from '../../domain/ports/token-service.port';
import { ListMyLoansUseCase } from '../../application/use-cases/loans/list-my-loans.usecase';
import { GetUserUseCase } from '../../application/use-cases/users/get-user.usecase';
import { ListLoansQueryDto } from '../../application/dtos/loan.dto';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeController {
  constructor(
    private readonly listMyLoans: ListMyLoansUseCase,
    private readonly getUser: GetUserUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Profile of the authenticated user' })
  @ApiResponse({ status: 200 })
  async me(@CurrentUser() user: TokenPayload) {
    return this.getUser.execute(user.sub);
  }

  @Get('loans')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'All loans for the authenticated user (paginated)' })
  @ApiResponse({ status: 200 })
  async myLoans(@CurrentUser() user: TokenPayload, @Query() q: ListLoansQueryDto) {
    return this.listMyLoans.execute({
      userId: user.sub,
      status: q.status,
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 20,
    });
  }
}
