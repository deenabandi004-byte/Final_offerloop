import { useNavigate } from 'react-router-dom';

interface LogoProps {
  className?: string;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Logo = ({ className = '', onClick, size = 'md' }: LogoProps) => {
  const navigate = useNavigate();
  
  const sizeClasses = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
    xl: 'text-3xl',
  };

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      navigate('/');
    }
  };

  return (
    <div 
      className={`flex items-center gap-2 cursor-pointer ${className}`}
      onClick={handleClick}
    >
      <span className={`font-bold ${sizeClasses[size]}`}>
        offer<span className="gradient-text-teal">loop</span>
      </span>
    </div>
  );
};
