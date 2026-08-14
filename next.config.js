/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Gera .next/standalone com o servidor e apenas as dependências usadas.
  // É o que permite a imagem Docker final rodar sem node_modules completo,
  // reduzindo o que sobe para a EC2 do laboratório da AWS.
  output: 'standalone',
};

module.exports = nextConfig;
