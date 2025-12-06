import { ReactNode } from 'react';

export interface CircularGalleryItem {
  image: string;
  text: string;
}

export interface CircularGalleryProps {
  items?: CircularGalleryItem[];
  bend?: number;
  textColor?: string;
  borderRadius?: number;
  font?: string;
  scrollSpeed?: number;
  scrollEase?: number;
}

declare function CircularGallery(props: CircularGalleryProps): ReactNode;

export default CircularGallery;

