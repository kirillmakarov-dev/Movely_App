import type { ReactNode, SVGProps } from "react";

type IconName = "arrow" | "house" | "box" | "shield" | "check" | "truck" | "menu" | "close" | "help";
const paths: Record<IconName, ReactNode> = {
  arrow: <path d="M19 12H5m6-6-6 6 6 6" />,
  house: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" /><path d="M9 21v-8h6v8M2 11l10-8 10 8" /></>,
  box: <><path d="m12 3 9 5v9l-9 5-9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v9M7.5 5.5l9 5v4" /></>,
  shield: <><path d="m12 3 8 3v6c0 5-8 10-8 10S4 17 4 12V6Z" /><path d="m8 12 3 3 5-6" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  truck: <><path d="M1 4h13v13H1Zm13 5h4l4 4v4h-8" /><circle cx="5" cy="18" r="3" /><circle cx="18" cy="18" r="3" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01" /></>,
};

export default function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg data-icon={name} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{paths[name]}</svg>;
}
