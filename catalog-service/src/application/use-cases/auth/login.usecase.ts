import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PASSWORD_HASHER, TOKEN_SERVICE, USER_REPOSITORY } from '../../../shared/di-tokens/tokens';
import { PasswordHasherPort } from '../../../domain/ports/password-hasher.port';
import { TokenServicePort } from '../../../domain/ports/token-service.port';
import { UserRepositoryPort } from '../../../domain/ports/user-repository.port';

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginOutput {
  accessToken: string;
}

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenServicePort,
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const user = await this.users.findByEmail(input.email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('invalid_credentials');
    }
    const ok = await this.hasher.compare(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('invalid_credentials');
    const accessToken = await this.tokens.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return { accessToken };
  }
}
