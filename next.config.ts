import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'my-backend-fanzoom.liara.run' },
    ],
  },
  // جلوگیری از bundle شدن jsdom برای سازگاری با Vercel Serverless
  serverExternalPackages: ['jsdom'],
  /* config options here */
};

export default nextConfig;
