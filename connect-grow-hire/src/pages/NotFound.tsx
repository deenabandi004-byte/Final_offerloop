import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFBFF]">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4" style={{ fontFamily: "'Lora', Georgia, serif", color: '#0F172A' }}>404</h1>
        <p className="text-xl text-[#6B7280] mb-4">Oops! Page not found</p>
        <a href="/" className="text-[#3B82F6] hover:text-[#2563EB] underline">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
