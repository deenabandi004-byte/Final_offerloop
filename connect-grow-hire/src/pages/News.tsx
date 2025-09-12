import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const News = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-16">
        <Button 
          variant="ghost" 
          onClick={() => navigate("/home")} 
          className="mb-8 p-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Button>
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold text-foreground mb-4">Loop News</h1>
          <p className="text-xl text-muted-foreground mb-6">Coming Soon</p>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Loop News keeps you up to date with the stories and updates that matter for your field. Whether it's the latest industry trends, job market shifts, or big headlines, you'll find what you need to stay sharp and prepared for your next move. We make it easy for students and young professionals to stay in the loop and ahead of the game.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default News;