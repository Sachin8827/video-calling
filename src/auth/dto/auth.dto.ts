import { IsEmail, IsString, MinLength, MaxLength, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', description: 'The email address of the user.' })
  @IsEmail({}, { message: 'Provide a valid email address.' })
  @MaxLength(254)
  @Transform(({ value }) => (value as string).toLowerCase().trim())
  email: string;

  /**
   * Max 72 characters — bcrypt silently truncates beyond this.
   * Argon2id has no practical limit, but we cap at 128 to prevent
   * hash-length DoS against any future algorithm migration.
   */
  @ApiProperty({ example: 'SecureP@ss123', description: 'User password (min 10 characters).' })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Password must be at least 10 characters.' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters.' })
  password: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user@example.com', description: 'The email address of the user.' })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (value as string).toLowerCase().trim())
  email: string;

  @ApiProperty({ example: 'SecureP@ss123', description: 'User password.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}

export class RefreshTokenDto {
  /** Sent via cookie in production; accepted via body for API clients */
  @ApiProperty({ description: 'The refresh token for regenerating access tokens.' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
