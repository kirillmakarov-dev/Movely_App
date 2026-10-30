import type { ComponentPropsWithoutRef } from "react";
import { localeHref } from "@/lib/locale";

type SafeLinkProps = ComponentPropsWithoutRef<"a"> & {
  href: string;
};

// Full-page navigation avoids the current Sites/Vinext client-router failure.
export default function SafeLink({ href, target, ...props }: SafeLinkProps) {
  return <a href={localeHref(href)} target={target ?? "_top"} {...props} />;
}
