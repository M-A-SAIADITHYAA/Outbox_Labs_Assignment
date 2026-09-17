/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:5001/api/:path*',
      },
      {
        source: '/admin/queues/:path*',
        destination: 'http://localhost:5001/admin/queues/:path*',
      },
    ];
  },
  images: {
    domains: ['images.unsplash.com', 'lh3.googleusercontent.com'],
  },
};

export default nextConfig;
