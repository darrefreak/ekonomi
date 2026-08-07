import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { dataSources } from "../schema-economic";
import { documents, syncRuns } from "../schema-intake";

export async function seedIntakeData(input: { householdId: string; asOf: string }) {
  const db = getDb();
  const sources = await db
    .select()
    .from(dataSources)
    .where(eq(dataSources.householdId, input.householdId));

  await db.insert(documents).values([
    {
      householdId: input.householdId,
      title: "Elfaktura juli",
      documentType: "INVOICE",
      status: "ACTION_REQUIRED",
      issuer: "Vattenfall",
      amountMinor: 1_482_00n,
      sourceName: "Kivra (mock)",
      extracted: { dueDate: "2026-08-20", ocr: false },
      notes: "Ingen riktig OCR — strukturerat mockextrakt",
    },
    {
      householdId: input.householdId,
      title: "Försäkringsbesked",
      documentType: "INSURANCE",
      status: "REVIEW",
      issuer: "Trygg-Hansa",
      amountMinor: 5_400_00n,
      sourceName: "Kivra (mock)",
      extracted: { renewalDate: "2027-01-01" },
    },
    {
      householdId: input.householdId,
      title: "Lönebesked juli",
      documentType: "SALARY",
      status: "ARCHIVED",
      issuer: "Acme AB",
      amountMinor: 42_600_00n,
      sourceName: "Manual upload (mock)",
      extracted: { payDate: "2026-07-25" },
    },
    {
      householdId: input.householdId,
      title: "Servicekvitto Volvo",
      documentType: "VEHICLE",
      status: "NEW",
      issuer: "Bilia",
      amountMinor: 4_890_00n,
      sourceName: "Email forward (mock)",
      extracted: { odometerKm: 75200 },
    },
  ]);

  if (sources[0]) {
    await db.insert(syncRuns).values({
      householdId: input.householdId,
      sourceId: sources[0].id,
      startedAt: new Date(`${input.asOf}T10:00:00.000Z`),
      completedAt: new Date(`${input.asOf}T10:00:12.000Z`),
      status: "COMPLETED",
      recordsFetched: 42,
      message: "Fake sync OK — inga riktiga connectors",
    });
  }
}
