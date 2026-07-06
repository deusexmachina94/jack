import type { UsagePeriod } from './service.js';

/**
 * Settlement port (SPEC §6). BRIP never holds funds: invoices are **direct charges
 * on the publisher's connected Stripe account** with a platform application fee.
 * The provider abstracts Stripe Connect so the aggregation logic stays testable.
 */
export interface SettlementProvider {
  /** Onboard a publisher, returning the connected account id. */
  createConnectedAccount(input: { publisherId: string; email: string }): Promise<{ accountId: string }>;
  /** Create a direct-charge invoice on the connected account for a usage period. */
  createInvoice(input: {
    connectedAccountId: string;
    usage: UsagePeriod;
    applicationFeeMinor: number;
  }): Promise<{ invoiceId: string }>;
}

/** Config for the platform fee. */
export interface FeePolicy {
  /** Application fee as basis points of the charge (e.g. 500 = 5%). */
  applicationFeeBps: number;
}

export function applicationFee(amountMinor: number, policy: FeePolicy): number {
  return Math.round((amountMinor * policy.applicationFeeBps) / 10_000);
}

/**
 * Production adapter backed by the Stripe SDK — interface only for now, matching the
 * KmsKeyProvider pattern. Wiring the real SDK is a deployment concern (needs live keys
 * / stripe-mock in CI) and is deliberately out of this build.
 */
export class StripeSettlementProvider implements SettlementProvider {
  createConnectedAccount(): Promise<{ accountId: string }> {
    throw new Error('NotImplemented: StripeSettlementProvider (wire Stripe SDK at deploy)');
  }
  createInvoice(): Promise<{ invoiceId: string }> {
    throw new Error('NotImplemented: StripeSettlementProvider (wire Stripe SDK at deploy)');
  }
}
