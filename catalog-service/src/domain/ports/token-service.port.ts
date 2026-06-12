import { Role } from '../../shared/types/role.enum';

export interface TokenPayload {
  sub: string;
  email: string;
  role: Role;
}

export interface TokenServicePort {
  sign(payload: TokenPayload): Promise<string>;
  verify(token: string): Promise<TokenPayload>;
}
