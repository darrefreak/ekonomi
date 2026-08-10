import { redirect } from "next/navigation";

/**
 * The overview lives at `/`, but `/dashboard` is the address people guess and
 * bookmark, and it answered 404. Redirecting costs nothing and removes a
 * not-found page from a plausible path into the product.
 */
export default function DashboardRedirect() {
  redirect("/");
}
