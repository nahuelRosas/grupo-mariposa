import { Controller, Get, Param, UseGuards, Query, Patch, Body, Delete } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../adapters/security/jwt-auth.guard';
import { RolesGuard } from '../adapters/security/roles.guard';
import { Roles } from '../adapters/security/roles.decorator';
import { Role } from '../../shared/types/role.enum';
import { GetUserUseCase } from '../../application/use-cases/users/get-user.usecase';
import { ListUsersUseCase } from '../../application/use-cases/users/list-users.usecase';
import { UpdateUserUseCase } from '../../application/use-cases/users/update-user.usecase';
import { DeleteUserUseCase } from '../../application/use-cases/users/delete-user.usecase';
import { UpdateUserDto, ListUsersQueryDto } from '../../application/dtos/user.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly getUser: GetUserUseCase,
    private readonly listUsers: ListUsersUseCase,
    private readonly updateUser: UpdateUserUseCase,
    private readonly deleteUser: DeleteUserUseCase,
  ) {}

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get a user by id (admin only)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'User not found' })
  getOne(@Param('id') id: string) {
    return this.getUser.execute(id);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List users (admin only)' })
  list(@Query() q: ListUsersQueryDto) {
    return this.listUsers.execute({ page: q.page ?? 1, pageSize: q.pageSize ?? 20 });
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update user (admin only)' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.updateUser.execute({ id, patch: dto });
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete user (admin only)' })
  async remove(@Param('id') id: string) {
    await this.deleteUser.execute(id);
    return { deleted: true };
  }
}
