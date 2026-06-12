export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    url: process.env.DATABASE_URL!,
  },
  loansService: {
    baseUrl: process.env.LOAN_SERVICE_URL ?? 'http://loans:8080',
    timeoutMs: parseInt(process.env.LOAN_SERVICE_TIMEOUT_MS ?? '3000', 10),
    transport: process.env.LOAN_TRANSPORT ?? 'http',
    grpcUrl: process.env.LOAN_SERVICE_GRPC ?? 'loans:50051',
    protoPath: process.env.GRPC_PROTO_PATH ?? '../proto/library.proto',
  },
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  },
  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10),
  },
  throttler: {
    ttl: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
    loginLimit: parseInt(process.env.LOGIN_THROTTLE_LIMIT ?? '5', 10),
  },
  cors: {
    origin: process.env.CORS_ORIGIN ?? '*',
  },
});
