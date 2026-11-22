import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    serverActions: {
      // A importação da tabela de preços envia as linhas da planilha numa server action.
      // 4 MB cobrem o limite de 5.000 produtos e ficam abaixo do teto de 4,5 MB da Vercel.
      bodySizeLimit: "4mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
