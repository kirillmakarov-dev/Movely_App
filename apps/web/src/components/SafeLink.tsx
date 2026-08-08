import type { ComponentPropsWithoutRef } from "react";

type SafeLinkProps = ComponentPropsWithoutRef<"a"> & {
  href: string;
};

// Full-page navigation avoids the current Sites/Vinext client-router failure.
export default function SafeLink({ href, target, ...props }: SafeLinkProps) {
  return <a href={href} target={target ?? "_top"} {...props} />;
}
