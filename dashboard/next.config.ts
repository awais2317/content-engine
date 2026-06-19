import type { NextConfig } from "next";

const API_TARGET = process.env.STUDIO_API_URL || "http://127.0.0.1:8080";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Proxy /api/* and /tasks/* to the FastAPI backend so the browser
      // sees a single origin (no CORS surprises).
      { source: "/api/:path*", destination: `${API_TARGET}/api/:path*` },
      { source: "/tasks/:path*", destination: `${API_TARGET}/tasks/:path*` },
    ];
  },
};

export default nextConfig;
