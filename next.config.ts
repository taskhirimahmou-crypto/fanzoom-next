import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'my-backend-fanzoom.liara.run' },
    ],
  },
  /* config options here */
};

export default nextConfig;
