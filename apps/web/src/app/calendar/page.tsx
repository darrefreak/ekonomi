import type { Metadata } from "next";
import { CalendarPage } from "@/components/plan/calendar-page";

export const metadata: Metadata = {
  title: "Finansiell kalender",
};

export default function Page() {
  return <CalendarPage />;
}
