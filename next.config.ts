import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp (portrait sheets, lib/images) is a native module loaded with a dynamic import, which
  // the file tracer can miss; without this the Vercel function fails to load it at draw time.
  outputFileTracingIncludes: {
    '/*': ['./node_modules/sharp/**/*', './node_modules/@img/**/*'],
  },
};

export default nextConfig;
