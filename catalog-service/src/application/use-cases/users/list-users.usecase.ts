import { Inject, Injectable } from '@nestjs/common';
import { USER_REPOSITORY } from '../../../shared/di-tokens/tokens';
import { UserRepositoryPort } from '../../../domain/ports/user-repository.port';

@Injectable()
export class ListUsersUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort) {}

  async execute(input: { page: number; pageSize: number }) {
    const skip = (input.page - 1) * input.pageSize;
    const { items, total } = await this.users.findAll({ skip, take: input.pageSize });
    return {
      items: items.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        isActive: u.isActive,
      })),
      page: input.page,
      pageSize: input.pageSize,
      total,
    };
  }
}
