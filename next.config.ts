import type { NextConfig } from "next";
import { appBasePath } from "./lib/app-path";

const nextConfig: NextConfig = {
  // The framework prefixes its routes and generated asset URLs at build time.
  basePath: appBasePath,
};

export default nextConfig;
