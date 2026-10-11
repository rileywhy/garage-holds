"use client";

import { useState, type ImgHTMLAttributes } from "react";

// A stored photo at a display size, falling back to the original if that
// size does not exist yet (photos uploaded before sizes were made get theirs
// on the next sweep).
export function PhotoImage({
  src,
  fallback,
  alt,
  ...rest
}: ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  fallback: string;
  alt: string;
}) {
  const [current, setCurrent] = useState(src);
  return (
    <img
      {...rest}
      alt={alt}
      src={current}
      onError={() => {
        if (current !== fallback) setCurrent(fallback);
      }}
    />
  );
}
