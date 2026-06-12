import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = app.get(ConfigService);
  const corsOrigin = config.get<string>('cors.origin') ?? '*';
  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Library Catalog Service')
    .setDescription(
      'Catalog + users + auth. Talks to Loan Service over HTTP (gRPC available as bonus).',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, doc);

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(
    `[bootstrap] Catalog Service listening on :${port} (docs: /api/docs, cors: ${corsOrigin})`,
  );
}
bootstrap();
