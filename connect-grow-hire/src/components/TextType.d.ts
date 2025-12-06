import { ReactNode, ComponentType } from 'react';

export interface VariableSpeed {
  min: number;
  max: number;
}

export interface TextTypeProps {
  text: string | string[];
  as?: ComponentType<any> | string;
  typingSpeed?: number;
  initialDelay?: number;
  pauseDuration?: number;
  deletingSpeed?: number;
  loop?: boolean;
  className?: string;
  showCursor?: boolean;
  hideCursorWhileTyping?: boolean;
  cursorCharacter?: string;
  cursorClassName?: string;
  cursorBlinkDuration?: number;
  textColors?: string[];
  variableSpeed?: VariableSpeed;
  onSentenceComplete?: (text: string, index: number) => void;
  startOnVisible?: boolean;
  reverseMode?: boolean;
  [key: string]: any;
}

declare function TextType(props: TextTypeProps): ReactNode;

export default TextType;

