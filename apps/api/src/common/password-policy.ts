import { ERROR_CODES } from '@yet-to-be/shared';
import { AppException } from './app-exception';
import { isCommonPassword } from '../auth/common-passwords';

/** Відхиляє поширені паролі та паролі, що містять частину email. */
export function assertStrongPassword(password: string, email: string): void {
  const localPart = email.split('@')[0]?.toLowerCase() ?? '';
  const lowered = password.toLowerCase();
  if (isCommonPassword(password) || (localPart.length >= 4 && lowered.includes(localPart))) {
    throw new AppException(400, ERROR_CODES.AUTH_WEAK_PASSWORD, 'Password is too easy to guess');
  }
}
