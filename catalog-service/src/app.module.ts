import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './shared/config/configuration';
import { envValidation } from './shared/config/env.validation';
import { InfrastructureModule } from './infrastructure.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidation,
    }),
    InfrastructureModule,
  ],
})
export class AppModule {}
