import type { Metadata } from "next";
import AccountRequests from "@/features/account/AccountRequests";

export const metadata: Metadata = { title: "הבקשות שלי" };

export default function AccountRequestsPage() {
  return <AccountRequests />;
}
