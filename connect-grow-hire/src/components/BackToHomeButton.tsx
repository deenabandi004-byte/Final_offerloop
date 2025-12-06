import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const BackToHomeButton = () => {
  const navigate = useNavigate();
  
  return (
    <Button
      size="sm"
      onClick={() => navigate("/home")}
      variant="outline"
      className="border-gray-600 hover:border-gray-500"
    >
      <ArrowLeft className="h-4 w-4 mr-2" />
      Back to Home
    </Button>
  );
};

