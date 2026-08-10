import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { jobOptionsFor, sanitizeJobId } from "./registry";
import { jobPayloadSchema, type JobType } from "@ffos/schemas";

/**
 * BullMQ throws `Custom Id cannot contain :` for a custom job id with a colon,
 * and the shared id builder joined its parts with colons. Eleven of thirteen job
 * types used it, so those enqueues failed silently for callers that treat
 * enqueueing as fire-and-forget.
 */
describe("job ids", () => {
  it("contains no colon for any job type", () => {
    const householdId = "11111111-1111-4111-8111-111111111111";
    const entityId = "22222222-2222-4222-8222-222222222222";
    const types = jobPayloadSchema.options.map(
      (option) => option.shape.type.value as JobType,
    );
    assert.ok(types.length >= 12, "every job type should be covered");

    for (const type of types) {
      const options = jobOptionsFor({
        type,
        householdId,
        asOf: "2026-08-10",
        entityId,
      } as never);
      assert.ok(options.jobId, `${type} must produce a job id`);
      assert.ok(
        !options.jobId!.includes(":"),
        `${type} produced "${options.jobId}", which BullMQ refuses`,
      );
    }
  });

  it("leaves an id alone when it has nothing to fix", () => {
    assert.equal(sanitizeJobId("health-system-2026-08-10T11"), "health-system-2026-08-10T11");
    assert.equal(sanitizeJobId("A:B:C"), "A-B-C");
  });
});
