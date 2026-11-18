/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";
// unsafe-eval is required by the Next.js development runtime only. Production never receives it.
const scriptSrc = `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`;

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Only meaningful over HTTPS. Sent in production only, so local HTTP development is unaffected.
          ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
          { key: "Content-Security-Policy", value: `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; ${scriptSrc}; connect-src 'self'${isDev ? " ws:" : ""}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` },
        ],
      },
    ];
  },
};
export default nextConfig;
