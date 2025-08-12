import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="es">
      <Head>
        <meta charSet="UTF-8" />
        
        {/* Preconnect to external domains for faster resource loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="preconnect" href="https://sxlogxqzmarhqsblxmtj.supabase.co" />
        <link rel="dns-prefetch" href="https://cdnjs.cloudflare.com" />
        
        {/* Optimized Google Fonts - only load necessary weights */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap"
          rel="stylesheet"
        />
        
        {/* Font Awesome - defer loading for non-critical icons */}
        <link
          rel="preload"
          as="style"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
          media="print"
          onLoad="this.media='all'"
        />
        
        {/* Resource hints for critical resources */}
        <link rel="preload" as="image" href="/Logo BW.png?v=3" />
        
        {/* Meta tags for performance */}
        <meta httpEquiv="x-dns-prefetch-control" content="on" />
        
        {/* Preload Tailwind CSS */}
        <link rel="preload" href="https://cdn.tailwindcss.com" as="script" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
