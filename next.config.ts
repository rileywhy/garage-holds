import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // On Vercel, api/crimp.py answers /api/crimp. Locally, point CRIMP_API_URL
  // at `python tools/crimp-generator/serve_api.py` to get the same route.
  async rewrites() {
    const api = process.env.CRIMP_API_URL;
    return api
      ? [
          {
            source: "/api/crimp",
            destination: `${api.replace(/\/$/, "")}/api/crimp`,
          },
        ]
      : [];
  },
};

export default config;
