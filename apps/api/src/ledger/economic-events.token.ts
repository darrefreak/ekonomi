/**
 * Injection token for EconomicEventsService.
 *
 * Consumers that the job graph can reach (vehicles, for example) must not
 * import the class value: jobs/queue → jobs/handlers → vehicles would close a
 * require cycle back into the ledger module.
 */
export const ECONOMIC_EVENTS_SERVICE = Symbol("ECONOMIC_EVENTS_SERVICE");
