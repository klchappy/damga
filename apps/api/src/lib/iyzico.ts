/**
 * Iyzico subscription client — STUB.
 * Production'da: https://docs.iyzico.com/v2/docs/subscription
 *
 * Şimdilik plan upgrade/downgrade UI'sının test edilebilmesi için
 * fake response döner. Iyzico hesabı + sandbox key alındıktan sonra
 * gerçek HTTP çağrıları implement edilecek.
 */
import { logger } from '../config/logger';

export interface IyzicoCreateSubscriptionInput {
  org_id: string;
  plan: 'starter' | 'pro' | 'business';
  email: string;
  name: string;
  card_token?: string;
}

export interface IyzicoSubscriptionResult {
  subscription_id: string;
  status: 'ACTIVE' | 'PENDING' | 'FAILED';
  plan: string;
  next_billing_date: string;
}

export async function createSubscription(
  input: IyzicoCreateSubscriptionInput,
): Promise<IyzicoSubscriptionResult> {
  logger.warn({ input }, 'Iyzico STUB — gerçek implementasyon Faz 9b');
  return {
    subscription_id: `stub_sub_${Date.now()}`,
    status: 'ACTIVE',
    plan: input.plan,
    next_billing_date: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
  };
}

export async function cancelSubscription(subscriptionId: string): Promise<{ ok: boolean }> {
  logger.warn({ subscriptionId }, 'Iyzico STUB cancel');
  return { ok: true };
}
