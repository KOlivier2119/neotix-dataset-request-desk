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
  // `/_next/image` is not served by this Vercel services deployment: the raw
  // `/robot.jpeg` returns 200 image/jpeg, but every optimizer URL
  // (`/_next/image?url=%2Frobot.jpeg&w=…`) returns the app's own not-found page
  // — verified against https://dataset-request-desk-five.vercel.app/login,
  // where the login photo rendered as a broken image. Serving images from
  // public/ unoptimized makes the <img> point straight at the file, which works
  // on Vercel, in docker compose and in `next dev`.
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
