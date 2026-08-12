import { useState } from 'react'
import type { ReactNode } from 'react'
import type { LevelImage } from '../types'

interface ImageWithFallbackProps {
  image: LevelImage
  className?: string
  children?: ReactNode
  fallback: ReactNode
  onImageFailedChange?: (failed: boolean) => void
}

export const ImageWithFallback = ({
  image,
  className,
  children,
  fallback,
  onImageFailedChange,
}: ImageWithFallbackProps) => {
  const [failed, setFailed] = useState(false)
  if (failed) return <>{fallback}</>
  return (
    <div className={`relative ${className ?? ''}`}>
      <img
        src={`${import.meta.env.BASE_URL}${image.path}`}
        alt={image.alt}
        width={image.width}
        height={image.height}
        className="block h-auto w-full rounded-lg object-contain"
        onError={() => {
          setFailed(true)
          onImageFailedChange?.(true)
        }}
      />
      {children}
    </div>
  )
}
