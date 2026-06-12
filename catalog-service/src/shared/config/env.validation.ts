import * as Joi from 'joi';

export const envValidation = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),

  LOAN_SERVICE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  LOAN_SERVICE_TIMEOUT_MS: Joi.number().default(3000),
  LOAN_TRANSPORT: Joi.string().valid('http', 'grpc').default('http'),

  LOAN_SERVICE_GRPC: Joi.string().default('loans:50051'),
  GRPC_PROTO_PATH: Joi.string().default('/app/proto/library.proto'),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('1h'),

  BCRYPT_ROUNDS: Joi.number().default(12),

  THROTTLE_TTL_MS: Joi.number().default(60_000),
  THROTTLE_LIMIT: Joi.number().default(100),
  LOGIN_THROTTLE_LIMIT: Joi.number().default(5),

  CORS_ORIGIN: Joi.string().default('*'),
});
