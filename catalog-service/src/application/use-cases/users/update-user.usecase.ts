import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PASSWORD_HASHER, USER_REPOSITORY } from '../../../shared/di-tokens/tokens';
import { PasswordHasherPort } from '../../../domain/ports/password-hasher.port';
import { UserRepositoryPort } from '../../../domain/ports/user-repository.port';
import { Role } from '../../../shared/types/role.enum';

export interface UpdateUserPatch {
  fullName?: string;
  role?: 'ADMIN' | 'USER';
  isActive?: boolean;
  password?: string;
}

@Injectable()
export class UpdateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
  ) {}

  async execute(input: { id: string; patch: UpdateUserPatch }) {
    const current = await this.users.findById(input.id);
    if (!current) throw new NotFoundException(`User ${input.id} not found`);

    const repoPatch: { fullName?: string; role?: Role; isActive?: boolean; passwordHash?: string } =
      {};
    if (input.patch.fullName !== undefined) repoPatch.fullName = input.patch.fullName;
    if (input.patch.role !== undefined) repoPatch.role = input.patch.role as Role;
    if (input.patch.isActive !== undefined) repoPatch.isActive = input.patch.isActive;
    if (input.patch.password) {
      repoPatch.passwordHash = await this.hasher.hash(input.patch.password);
    }
    const updated = await this.users.update(input.id, repoPatch);
    return {
      id: updated.id,
      email: updated.email,
      fullName: updated.fullName,
      role: updated.role,
      isActive: updated.isActive,
    };
  }
}
