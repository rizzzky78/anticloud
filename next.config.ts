import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained build (`.next/standalone`) so the Docker runner image
  // can ship just the server + traced dependencies instead of the whole repo.
  output: "standalone",
};

export default nextConfig;
