import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TokenPayload } from '../../domain/ports/token-service.port';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TokenPayload => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as TokenPayload;
  },
);
