"use client";

import { useEffect } from "react";

export default function DocsPage() {
  useEffect(() => {
    
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/swagger-ui-dist@5/swagger-ui.css";
    document.head.appendChild(link);

    
    const script = document.createElement("script");
    script.src = "https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js";
    script.async = true;
    script.onload = () => {
      
      if ((window as any).SwaggerUIBundle) {
        (window as any).SwaggerUIBundle({
          url: "/openapi.json",
          dom_id: "#swagger-ui",
          deepLinking: true,
          presets: [
            (window as any).SwaggerUIBundle.presets.apis,
            (window as any).SwaggerUIBundle.SwaggerUIStandalonePreset
          ],
        });
      }
    };
    document.body.appendChild(script);

    
    return () => {
      link.remove();
      script.remove();
    };
  }, []);

  return (
    <div style={{ backgroundColor: "#ffffff", minHeight: "100vh" }}>
      {/* Contenedor HTML puro donde se montará la documentación */}
      <div id="swagger-ui"></div>
    </div>
  );
}
