import { removeBackground, loadImage } from '@/lib/backgroundRemoval';
import originalImage from '@/assets/original-crowd-illustration.png';

export async function processImageWithTransparentBackground(): Promise<string> {
  try {
    // Load the original image
    const response = await fetch(originalImage);
    const blob = await response.blob();
    const imageElement = await loadImage(blob);
    
    // Remove background
    const processedBlob = await removeBackground(imageElement);
    
    // Convert to data URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(processedBlob);
    });
  } catch (error) {
    console.error('Failed to process image:', error);
    // Fallback to original image
    return originalImage;
  }
}