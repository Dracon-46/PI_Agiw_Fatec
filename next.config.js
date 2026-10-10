/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

// "output: standalone" gera .next/standalone, usado pela imagem Docker. Só é
// aplicado no build: ligado durante o "next dev" ele trava o servidor em
// "Starting..." e nenhuma rota responde. O Dockerfile define BUILD_STANDALONE=1.
if (process.env.BUILD_STANDALONE === '1') {
  nextConfig.output = 'standalone';
}

export default nextConfig;