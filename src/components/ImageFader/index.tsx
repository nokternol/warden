import Image from 'next/image';
import { useEffect, useState } from 'react';

interface ImageFaderProps {
  images: string[];
  rotationSpeed?: number;
  className?: string;
}

export function ImageFader({ images, rotationSpeed = 6000, className = '' }: ImageFaderProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (images.length === 0) return;

    const interval = setInterval(() => {
      setActiveIndex((current) => (current + 1) % images.length);
    }, rotationSpeed);

    return () => clearInterval(interval);
  }, [images, rotationSpeed]);

  if (images.length === 0) return null;

  return (
    <div className={`relative h-full w-full ${className}`}>
      {images.map((imageUrl, index) => (
        <div
          key={imageUrl}
          aria-hidden={index !== activeIndex}
          className={`absolute inset-0 transition-opacity duration-150 ${
            index === activeIndex ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <Image
            src={imageUrl}
            alt=""
            fill
            className="object-cover"
            priority={index === 0}
            unoptimized
          />
        </div>
      ))}
    </div>
  );
}
