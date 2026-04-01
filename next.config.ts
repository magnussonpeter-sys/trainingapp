import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.10.2",
    "192.168.1.161",
        "192.168.1.147", // din iPhone-access
    "localhost",
    "127.0.0.1",
  ],
};

export default nextConfig;
