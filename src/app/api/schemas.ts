import { z } from 'zod';

// ──────────────────────────────────────────────
// Push subscription schema (Web Push API)
// ──────────────────────────────────────────────
export const PushSubscriptionSchema = z.object({
  endpoint: z.string().url('subscription.endpoint must be a valid URL'),
  expirationTime: z.number().nullable().optional(),
  keys: z
    .object({
      p256dh: z.string().min(1, 'keys.p256dh is required'),
      auth: z.string().min(1, 'keys.auth is required'),
    })
    .optional(),
});

// ──────────────────────────────────────────────
// Feedback schema
// ──────────────────────────────────────────────
export const FeedbackSchema = z.object({
  name: z.string().max(80).optional().default(''),
  email: z
    .string()
    .max(120)
    .email('Enter a valid email address.')
    .optional()
    .or(z.literal('')),
  rating: z.string().max(24).optional().default(''),
  message: z
    .string()
    .min(1, 'Feedback message is required.')
    .max(1200, 'Feedback message is too long.'),
  page: z.string().max(240).optional().default(''),
});

// ──────────────────────────────────────────────
// Vault schemas — discriminated union by action
// ──────────────────────────────────────────────
const VaultEncryptSchema = z.object({
  action: z.literal('encrypt'),
  secret: z.string().min(1, 'Missing required parameter: secret'),
  keyId: z.string().min(1, 'Missing required parameter: keyId'),
  keyMaterial: z.string().min(1, 'Missing required parameter: keyMaterial'),
  hardwareBacked: z.boolean().optional().default(false),
});

const VaultVerifySchema = z.object({
  action: z.literal('verify'),
  record: z.object({
    version: z.literal(1),
    algorithm: z.literal('AES-256-GCM'),
    keyId: z.string().min(1),
    hardwareBacked: z.boolean(),
    iv: z.string().min(1),
    authTag: z.string().min(1),
    ciphertext: z.string().min(1),
    createdAt: z.string().min(1),
  }),
  keyMaterial: z.string().min(1, 'Missing required parameter: keyMaterial'),
});

export const VaultPostSchema = z.discriminatedUnion('action', [
  VaultEncryptSchema,
  VaultVerifySchema,
]);