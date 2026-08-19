const optimizedLocalImages: Record<string, string> = {
  "/images/bouquet-1.png": "/images/bouquet-1.webp",
  "/images/bouquet-2.png": "/images/bouquet-2.webp",
  "/images/bouquet-3.png": "/images/bouquet-3.webp",
  "/images/bouquet-4.png": "/images/bouquet-4.webp",
  "/images/bouquet-5.png": "/images/bouquet-5.webp",
  "/images/bouquet-6.png": "/images/bouquet-6.webp",
  "/images/composition-roses.png": "/images/composition-roses.webp",
  "/images/florist-workshop.png": "/images/florist-workshop.webp",
  "/images/flowers-lilies.png": "/images/flowers-lilies.webp",
  "/images/gypsophila-rainbow.png": "/images/gypsophila-rainbow.webp",
  "/images/gypsophila-white.png": "/images/gypsophila-white.webp",
  "/images/hero-bouquet.png": "/images/hero-bouquet.webp",
  "/images/lily-pink.png": "/images/lily-pink.webp",
  "/images/lily-white.png": "/images/lily-white.webp",
};

export function optimizedImageSource(source: string) {
  const suffixIndex = source.search(/[?#]/);
  const pathname = suffixIndex === -1 ? source : source.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : source.slice(suffixIndex);
  const optimizedPath = optimizedLocalImages[pathname];

  return optimizedPath ? `${optimizedPath}${suffix}` : source;
}
