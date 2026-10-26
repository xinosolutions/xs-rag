import { z } from 'zod';
import { Limits } from '@xs-rag/shared';

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'min_length_1').max(80, 'max_length_80'),
  email: z.string().trim().email('invalid_email'),
  password: z
    .string()
    .min(Limits.PASSWORD_MIN_LENGTH, `min_length_${Limits.PASSWORD_MIN_LENGTH}`)
    .max(Limits.PASSWORD_MAX_LENGTH, `max_length_${Limits.PASSWORD_MAX_LENGTH}`),
});

export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email('invalid_email'),
  password: z.string().min(1, 'min_length_1'),
});

export type LoginDto = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('invalid_email'),
});

export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, 'token_required'),
  password: z
    .string()
    .min(Limits.PASSWORD_MIN_LENGTH, `min_length_${Limits.PASSWORD_MIN_LENGTH}`)
    .max(Limits.PASSWORD_MAX_LENGTH, `max_length_${Limits.PASSWORD_MAX_LENGTH}`),
});

export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
