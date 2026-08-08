import type { Metadata } from "next";
import AccountRequests from "@/features/account/AccountRequests";

export const metadata: Metadata = { title: "My Requests" };

export default function AccountRequestsPage() {
  return <AccountRequests />;
}
