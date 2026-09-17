const backendUrl = (
  process.env.BACKEND_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:5001'
).replace(/\/$/, '');

const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/admin/queues/:path*',
        destination: `${backendUrl}/admin/queues/:path*`,
      },
    ];
  },
  images: {
    domains: ['images.unsplash.com', 'lh3.googleusercontent.com'],
  },
};

export default nextConfig;
