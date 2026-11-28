import { z } from 'zod';
import { PASSWORD_MAX_LENGTH } from './auth';

/** 6 цифр TOTP (RFC 6238). Пробіли, які додають застосунки-автентифікатори, прибираються. */
export const totpCodeSchema = z
  .string()
  .max(16)
  .transform((value) => value.replaceAll(/\s/g, ''))
  .pipe(z.string().regex(/^\d{6}$/));

/** Резервний код: 10 символів base32 у форматі XXXXX-XXXXX (регістр неважливий). */
export const recoveryCodeSchema = z
  .string()
  .max(16)
  .transform((value) => value.trim().toUpperCase())
  .pipe(z.string().regex(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/));

export const mfaCodeInputSchema = z.strictObject({ code: totpCodeSchema });
export type MfaCodeInput = z.infer<typeof mfaCodeInputSchema>;

/** Підтвердження MFA: або код із застосунку, або один резервний код. */
export const mfaVerifySchema = z.union([
  z.strictObject({ code: totpCodeSchema }),
  z.strictObject({ recoveryCode: recoveryCodeSchema }),
]);
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

/** Повторне підтвердження паролем перед критичною дією (step-up). */
export const stepUpSchema = z.strictObject({
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type StepUpInput = z.infer<typeof stepUpSchema>;

export const mfaStatusSchema = z.object({
  enabled: z.boolean(),
  /** Роль користувача вимагає MFA. */
  required: z.boolean(),
  /** MFA підтверджено в цій сесії. */
  sessionVerified: z.boolean(),
  /** До якого часу діє повторне підтвердження (step-up). */
  stepUpUntil: z.string().nullable(),
});
export type MfaStatus = z.infer<typeof mfaStatusSchema>;

export const mfaSetupResponseSchema = z.object({ secret: z.string(), otpauthUri: z.string() });
export type MfaSetupResponse = z.infer<typeof mfaSetupResponseSchema>;

export const mfaEnableResponseSchema = z.object({ recoveryCodes: z.array(z.string()) });
export type MfaEnableResponse = z.infer<typeof mfaEnableResponseSchema>;
