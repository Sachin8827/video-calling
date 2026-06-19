import { ValidationPipe } from '@nestjs/common';

/**
 * Strict validation pipe applied globally.
 *
 * - whitelist:      strips any properties not present in the DTO
 * - forbidNonWhitelisted: rejects requests with extra properties (400)
 * - transform:      coerces payloads into DTO instances (enables @Transform)
 * - transformOptions.enableImplicitConversion — disabled intentionally;
 *   explicit @Transform decorators are clearer and safer
 */
export const globalValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: false,
  },
});
