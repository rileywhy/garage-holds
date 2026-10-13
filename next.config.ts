import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // The old address sends visitors to the domain, so search engines and
  // shared links settle on one site. API paths stay put: Vercel's cron and
  // the lab generators are called by path, never by a person.
  async redirects() {
    return [
      {
        source: "/:path((?!api/).*)?",
        has: [{ type: "host", value: "garage-holds.vercel.app" }],
        destination: "https://garageholds.com/:path",
        permanent: true,
      },
    ];
  },
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
