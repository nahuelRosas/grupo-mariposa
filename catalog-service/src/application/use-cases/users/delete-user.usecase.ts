import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { USER_REPOSITORY } from '../../../shared/di-tokens/tokens';
import { UserRepositoryPort } from '../../../domain/ports/user-repository.port';

@Injectable()
export class DeleteUserUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort) {}

  async execute(id: string): Promise<void> {
    const current = await this.users.findById(id);
    if (!current) throw new NotFoundException(`User ${id} not found`);
    await this.users.delete(id);
  }
}
