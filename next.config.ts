import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
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
