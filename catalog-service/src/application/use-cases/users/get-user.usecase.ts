import { Inject, Injectable } from '@nestjs/common';
import { USER_REPOSITORY } from '../../../shared/di-tokens/tokens';
import { UserRepositoryPort } from '../../../domain/ports/user-repository.port';
import { UserNotFoundException } from '../../../domain/exceptions/user-not-found.exception';
import { toUserResponse, UserResponseDto } from '../../mappers/user.mapper';

@Injectable()
export class GetUserUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort) {}

  async execute(id: string): Promise<UserResponseDto> {
    const u = await this.users.findById(id);
    if (!u) throw new UserNotFoundException(id);
    return toUserResponse(u);
  }
}
