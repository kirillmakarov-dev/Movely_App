import type { NextConfig } from "next";
import { generateLocales } from "./scripts/generate-locales.mjs";

generateLocales();

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
