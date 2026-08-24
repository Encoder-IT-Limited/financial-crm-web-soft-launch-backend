process.env.ROOT_DOMAIN ??= "localhost";
process.env.PUBLIC_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.TENANT_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-32chars-minimum!!";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-32chars-minimum!";
process.env.NODE_ENV ??= "test";
