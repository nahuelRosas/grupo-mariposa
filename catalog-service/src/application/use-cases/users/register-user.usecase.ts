import { Inject, Injectable } from '@nestjs/common';
import { PASSWORD_HASHER, USER_REPOSITORY } from '../../../shared/di-tokens/tokens';
import { PasswordHasherPort } from '../../../domain/ports/password-hasher.port';
import { UserRepositoryPort } from '../../../domain/ports/user-repository.port';
import { User } from '../../../domain/entities/user.entity';
import { Role } from '../../../shared/types/role.enum';
import { DuplicateEmailException } from '../../../domain/exceptions/duplicate-email.exception';
import { UserResponseDto, toUserResponse } from '../../mappers/user.mapper';

export interface RegisterUserInput {
  email: string;
  password: string;
  fullName: string;
  role?: Role;
}

@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
  ) {}

  async execute(input: RegisterUserInput): Promise<UserResponseDto> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      throw new DuplicateEmailException(input.email);
    }
    const hash = await this.hasher.hash(input.password);
    const now = new Date();
    const user = new User(
      '',
      input.email,
      hash,
      input.fullName,
      input.role ?? Role.USER,
      true,
      now,
      now,
    );
    const created = await this.users.create(user);
    return toUserResponse(created);
  }
}
