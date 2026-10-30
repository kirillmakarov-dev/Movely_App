import { redirect } from "next/navigation";
import { localeHref } from "@/lib/locale";

export default function AccountPage() {
  redirect(localeHref("/account/requests"));
}
