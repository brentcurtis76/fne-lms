import React from 'react';

interface BadgeIconProps {
  size?: number;
  colorPrimary?: string;
  colorSecondary?: string;
  className?: string;
}

/**
 * Genera G Badge Icon
 * Based on the Genera brand guidelines - stylized G with central hub
 * The incomplete circle represents continuous transformation
 * The central dot symbolizes the collaborative hub
 */
export const GeneraBadgeIcon: React.FC<BadgeIconProps> = ({
  size = 48,
  colorPrimary = '#fbbf24', // Brand Amarillo
  colorSecondary = '#0a0a0a', // Brand Negro
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Genera Badge"
    >
      {/* Background circle with dark color */}
      <circle
        cx="24"
        cy="24"
        r="22"
        fill={colorSecondary}
        stroke={colorPrimary}
        strokeWidth="2"
      />

      {/* Incomplete circle (G shape) - represents continuous transformation */}
      <path
        d="M24 8C15.163 8 8 15.163 8 24C8 32.837 15.163 40 24 40C32.837 40 40 32.837 40 24"
        stroke={colorPrimary}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />

      {/* Horizontal line connecting center to edge */}
      <line
        x1="24"
        y1="24"
        x2="38"
        y2="24"
        stroke={colorPrimary}
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Central hub dot */}
      <circle
        cx="24"
        cy="24"
        r="4"
        fill={colorPrimary}
      />
    </svg>
  );
};

/**
 * Simple badge icon wrapper for Lucide-style icons
 */
export const BadgeIconWrapper: React.FC<{
  children: React.ReactNode;
  size?: number;
  colorPrimary?: string;
  colorSecondary?: string;
  className?: string;
}> = ({
  children,
  size = 48,
  colorPrimary = '#fbbf24',
  colorSecondary = '#0a0a0a',
  className = '',
}) => {
  return (
    <div
      className={`relative rounded-full flex items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: colorSecondary,
        border: `2px solid ${colorPrimary}`,
      }}
    >
      <div style={{ color: colorPrimary }}>
        {children}
      </div>
    </div>
  );
};

export default GeneraBadgeIcon;
