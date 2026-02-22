import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const BackToHomeButton = () => {
  const navigate = useNavigate();
  
  return (
    <Button
      size="sm"
      onClick={() => navigate("/contact-search")}
      variant="outline"
      className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
    >
      <ArrowLeft className="h-4 w-4 mr-2" />
      Find people
    </Button>
  );
};

