import React from "react";

// Пиала чая — заменяет "огонёк" streak (как в Duocards), в цветах флага Узбекистана.
// API совместим с lucide-иконками: size, color, fill (fill применяется к парку/ободку).
export function TeaBowl({ size = 24, color, fill }) {
  const accent = fill || color || "#C88D49";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <path d="M15 14 Q15 9 19 10" stroke={color || "#B4B2A9"} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.8" />
      <path d="M22 12 Q22 7 26 8" stroke={color || "#B4B2A9"} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.8" />
      <path d="M29 14 Q29 9 33 10" stroke={color || "#B4B2A9"} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.8" />
      <path d="M11 20 Q24 15.5 37 20 Q36 34 24 39 Q12 34 11 20 Z" fill="#FEFEFE" stroke={color || "#1D201C"} strokeWidth="1.4" />
      <path d="M13.6 26 Q24 30.3 34.4 26" stroke="#0099B5" strokeWidth="2.4" fill="none" />
      <path d="M15.2 31 Q24 34.8 32.8 31" stroke="#1EB53A" strokeWidth="2.4" fill="none" />
      <ellipse cx="24" cy="20.3" rx="13" ry="2.6" fill="#CE1126" />
      <ellipse cx="24" cy="20.3" rx="12.3" ry="2.2" fill={accent} />
    </svg>
  );
}
