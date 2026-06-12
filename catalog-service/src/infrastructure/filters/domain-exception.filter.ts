import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { DomainException } from '../../domain/exceptions/domain.exception';
import { BookNotFoundException } from '../../domain/exceptions/book-not-found.exception';
import { UserNotFoundException } from '../../domain/exceptions/user-not-found.exception';
import { DuplicateIsbnException } from '../../domain/exceptions/duplicate-isbn.exception';
import { DuplicateEmailException } from '../../domain/exceptions/duplicate-email.exception';
import { InsufficientStockException } from '../../domain/exceptions/insufficient-stock.exception';
import { LoanServiceUnavailableException } from '../../domain/exceptions/loan-service-unavailable.exception';
import { LoanNotFoundException } from '../../domain/exceptions/loan-not-found.exception';

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: DomainException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const status = this.mapToStatus(exception);
    this.logger.warn(`domain exception ${exception.code}: ${exception.message}`);
    res.status(status).json({
      code: exception.code,
      message: exception.message,
      statusCode: status,
    });
  }

  private mapToStatus(e: DomainException): number {
    if (e instanceof BookNotFoundException || e instanceof UserNotFoundException)
      return HttpStatus.NOT_FOUND;
    if (e instanceof LoanNotFoundException) return HttpStatus.NOT_FOUND;
    if (e instanceof DuplicateIsbnException || e instanceof DuplicateEmailException)
      return HttpStatus.CONFLICT;
    if (e instanceof InsufficientStockException) return HttpStatus.CONFLICT;
    if (e instanceof LoanServiceUnavailableException) return HttpStatus.SERVICE_UNAVAILABLE;
    return HttpStatus.BAD_REQUEST;
  }
}
