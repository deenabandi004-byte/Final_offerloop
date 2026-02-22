import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3, TrendingUp, Award, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";

const Dashboard = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: BarChart3,
      title: "Track Progress",
      description: "Visualize your networking growth with interactive charts"
    },
    {
      icon: TrendingUp,
      title: "Monitor Journey",
      description: "See your recruiting success metrics in real-time"
    },
    {
      icon: Award,
      title: "Earn Badges",
      description: "Unlock achievements as you reach new milestones"
    },
    {
      icon: Zap,
      title: "Manage Credits",
      description: "Keep track of your usage and plan upgrades"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-16">
        <Button 
          variant="ghost" 
          onClick={() => navigate("/contact-search")} 
          className="mb-8 p-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Find people
        </Button>
        
        <div className="max-w-5xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-6">
              <BarChart3 className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-5xl font-bold text-foreground mb-4">Dashboard</h1>
            <div className="inline-block">
              <span className="text-2xl text-muted-foreground bg-primary/5 px-6 py-2 rounded-full border border-primary/20">
                Coming Soon
              </span>
            </div>
          </div>

          {/* Description */}
          <p className="text-xl text-center text-muted-foreground leading-relaxed mb-16 max-w-3xl mx-auto">
            Your Dashboard will be your command center for tracking networking progress, monitoring your recruiting journey, and visualizing your career development.
          </p>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            {features.map((feature, index) => (
              <Card key={index} className="border-2 hover:border-primary/50 transition-colors">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <feature.icon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-foreground mb-2">
                        {feature.title}
                      </h3>
                      <p className="text-muted-foreground">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* CTA Section */}
          <div className="text-center bg-primary/5 rounded-2xl p-8 border border-primary/20">
            <p className="text-lg text-muted-foreground mb-4">
              Stay organized and motivated as you build your professional network and advance your career goals.
            </p>
            <p className="text-sm text-muted-foreground">
              We're working hard to bring you this feature. Check back soon!
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Dashboard;