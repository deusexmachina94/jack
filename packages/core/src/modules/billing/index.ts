// billing module — usage aggregation (idempotent) + Stripe Connect settlement port.
export { aggregateUsage, recordAccessEvent, type UsagePeriod } from './service.js';
export { billingRoutes, type BillingDeps } from './routes.js';
export {
  applicationFee,
  StripeSettlementProvider,
  type SettlementProvider,
  type FeePolicy,
} from './stripe.js';
