/**
 * Невеликий вбудований список найчастіших паролів (довжиною ≥10, бо коротші не пройдуть
 * схему). Для production варто підключити повний список (наприклад, top-10k) або HIBP k-anonymity.
 */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  '1234567890',
  '0123456789',
  '12345678910',
  '1234567890a',
  'password1',
  'password12',
  'password123',
  'password1234',
  'passw0rd123',
  'qwertyuiop',
  'qwerty1234',
  'qwerty12345',
  'qwertyuiop123',
  '1q2w3e4r5t',
  '1qaz2wsx3edc',
  'iloveyou123',
  'iloveyou12',
  'letmein123',
  'welcome123',
  'welcome1234',
  'admin12345',
  'administrator',
  'abc1234567',
  'abcdefghij',
  'abcd123456',
  'trustno1234',
  'baseball123',
  'football123',
  'monkey12345',
  'dragon12345',
  'superman123',
  'princess123',
  'sunshine123',
  'changeme123',
  'changemenow',
  'zaq12wsxcde3',
  'asdfghjkl1',
  'asdfghjklqwerty',
  'qazwsxedcrfv',
  '0000000000',
  '1111111111',
  '1212121212',
  'aaaaaaaaaa',
]);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.trim().toLowerCase());
}
