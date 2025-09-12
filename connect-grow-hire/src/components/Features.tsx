import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Target, MessageSquare, TrendingUp } from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Smart Matching",
    description: "Our AI-powered algorithm connects the right talent with the right opportunities based on skills, experience, and culture fit."
  },
  {
    icon: Target,
    title: "Targeted Recruiting",
    description: "Find candidates who perfectly match your requirements with advanced filtering and search capabilities."
  },
  {
    icon: MessageSquare,
    title: "Seamless Communication",
    description: "Built-in messaging and video interview tools make it easy to connect and communicate with candidates."
  },
  {
    icon: TrendingUp,
    title: "Analytics & Insights",
    description: "Track your hiring metrics, measure success rates, and optimize your recruitment process with detailed analytics."
  }
];

const Features = () => {
  return (
    <section className="py-20 bg-background">
      <div className="container px-6 mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-4xl font-bold mb-4">
            Why Choose Offerloop.ai?
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Everything you need to streamline your hiring process and find the best talent efficiently.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <Card key={index} className="text-center border-0 shadow-card hover:shadow-soft transition-shadow duration-300">
              <CardHeader>
                <div className="mx-auto w-12 h-12 bg-accent rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-xl">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;