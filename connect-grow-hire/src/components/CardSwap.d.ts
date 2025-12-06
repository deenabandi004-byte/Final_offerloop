import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  customClass?: string;
}

export declare const Card: React.ForwardRefExoticComponent<CardProps & React.RefAttributes<HTMLDivElement>>;

export interface CardSwapProps {
  width?: number;
  height?: number;
  cardDistance?: number;
  verticalDistance?: number;
  delay?: number;
  pauseOnHover?: boolean;
  onCardClick?: (index: number) => void;
  skewAmount?: number;
  easing?: 'elastic' | 'smooth';
  children: React.ReactNode;
}

declare const CardSwap: React.FC<CardSwapProps>;

export default CardSwap;

