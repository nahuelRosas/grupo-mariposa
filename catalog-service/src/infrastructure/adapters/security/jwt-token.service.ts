import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenServicePort, TokenPayload } from '../../../domain/ports/token-service.port';

@Injectable()
export class JwtTokenService implements TokenServicePort {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  sign(payload: TokenPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('jwt.secret'),
      expiresIn: this.config.get<string>('jwt.expiresIn') ?? '1h',
    });
  }

  async verify(token: string): Promise<TokenPayload> {
    const decoded = await this.jwt.verifyAsync<TokenPayload>(token, {
      secret: this.config.getOrThrow<string>('jwt.secret'),
    });
    return decoded;
  }
}
