import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // On Vercel, api/crimp.py answers /api/crimp. Locally, point CRIMP_API_URL
  // at `python tools/crimp-generator/serve_api.py` to get the same route.
  async rewrites() {
    return [
      ["crimp", process.env.CRIMP_API_URL],
      ["sloper", process.env.SLOPER_API_URL],
    ].flatMap(([name, api]) =>
      api
        ? [
            {
              source: `/api/${name}`,
              destination: `${api.replace(/\/$/, "")}/api/${name}`,
            },
          ]
        : [],
    );
  },
};

export default config;
