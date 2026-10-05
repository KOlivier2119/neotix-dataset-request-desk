import type { NextConfig } from "next";

// Where the API lives *relative to this dev server*. Only used by `next dev`
// and docker compose.
//
// On Vercel this never runs: the top-level rewrites in vercel.json route
// `/api/(.*)` to the `backend` service before the request reaches Next, and a
// `request.path` transform inside that service strips the `/api` prefix. So
// there is no internal base URL to hardcode in a deployment — the browser and
// the API share one domain and one origin.
const apiUrl = process.env.API_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
