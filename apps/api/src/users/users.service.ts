import { Inject, Injectable } from '@nestjs/common';
import type { UserDto } from '@yet-to-be/shared';
import type { User } from '../generated/prisma/client';
import { buildAad, EncryptionService } from '../infra/crypto/encryption.service';

/** Перетворення запису БД у DTO для клієнта: розшифровує поля й прибирає службові дані. */
@Injectable()
export class UsersService {
  constructor(@Inject(EncryptionService) private readonly encryption: EncryptionService) {}

  emailAad(userId: string): string {
    return buildAad('users', 'email', userId);
  }

  toDto(user: User): UserDto {
    return {
      id: user.id,
      email: this.encryption.decrypt(user.emailEncrypted, this.emailAad(user.id)),
      displayName: user.displayName,
      firstName: this.decryptOptional(user.firstNameEncrypted, 'firstName', user.id),
      lastName: this.decryptOptional(user.lastNameEncrypted, 'lastName', user.id),
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      providers: user.passwordHash === null ? [] : ['password'],
      createdAt: user.createdAt.toISOString(),
    };
  }

  private decryptOptional(value: string | null, field: string, userId: string): string | null {
    return value === null ? null : this.encryption.decrypt(value, buildAad('users', field, userId));
  }
}
