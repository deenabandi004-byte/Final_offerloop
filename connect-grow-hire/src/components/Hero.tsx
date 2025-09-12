import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, Calendar, Handshake, BarChart } from "lucide-react";

const features = [
  {
    icon: Send,
    title: "Instant Outreach",
    description: "Automate personalized applications and messages to top employers with a single click—no more copy-pasting or repetitive forms.",
    iconColor: "text-blue-500"
  },
  {
    icon: Calendar,
    title: "Effortless Scheduling", 
    description: "Seamlessly coordinate interviews and networking calls without the back-and-forth. Our smart scheduler handles all the logistics for you.",
    iconColor: "text-purple-500"
  },
  {
    icon: Handshake,
    title: "Meaningful Connections",
    description: "Jump straight to real conversations with professionals and hiring managers—skip the small talk and get to what matters most.",
    iconColor: "text-pink-500"
  },
  {
    icon: BarChart,
    title: "Progress Tracking",
    description: "Visualize your job search journey, track every application and response, and stay organized all the way to your next offer.",
    iconColor: "text-rose-500"
  }
];

const Hero = () => {
  return (
    <>
      <section className="relative py-20 lg:py-32 bg-slate-800">
        <div className="container px-6 mx-auto text-center">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-4xl lg:text-6xl font-bold tracking-tight mb-6 text-white">
              Join the <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">Loop</span>
            </h1>
            
            <p className="text-xl text-gray-300 mb-8 leading-relaxed">
              We're here to help you land better offers, faster—by taking the tedious, repetitive work out of recruiting. Spend <span className="font-bold text-white">less time</span> stuck behind a screen and more time where it matters: connecting with professionals and <span className="font-bold text-white">living your life</span>. We handle the busywork, so you can focus on your growth, your passions, and your next big opportunity.
            </p>
          </div>
        </div>
      </section>
      
      <section className="py-20 bg-white">
        <div className="container px-6 mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">
              Why Choose Offerloop.ai?
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Everything you need to streamline your recruiting process and land the best opportunities — in less time.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="text-center border-0 shadow-card hover:shadow-soft transition-shadow duration-300">
                <CardHeader>
                  <div className="mx-auto w-12 h-12 bg-accent rounded-lg flex items-center justify-center mb-4">
                    <feature.icon className={`w-6 h-6 ${feature.iconColor}`} />
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
    </>
  );
};

export default Hero;