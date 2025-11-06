import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft, Users, Lightbulb, Heart } from "lucide-react";

const AboutUs = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-6 py-16">
        <div className="max-w-4xl mx-auto space-y-12">
          {/* Back Button */}
          <div className="flex justify-start">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/home" className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Home
              </Link>
            </Button>
          </div>
          {/* Hero Section */}
          <div className="text-center space-y-6">
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              About Offerloop.ai
            </h1>
          </div>

          {/* Mission Section */}
          <Card className="border-none shadow-lg">
            <CardContent className="p-8">
              <h2 className="text-2xl font-semibold mb-4 text-center">Our Mission</h2>
              <p className="text-muted-foreground leading-relaxed text-center">
                To make it easier for students and young professionals to connect, stand out and land better opportunities. By cutting down the time to send emails and prep for calls by <strong>90%</strong>, we save our users hundreds of hours of work and stress, giving them back time to focus on what matters: learning, growing and enjoying your best years.              </p>
            </CardContent>
          </Card>

          {/* Values Grid */}
          <div className="grid md:grid-cols-3 gap-6">
            {/* High-Impact Connections */}
            <Card className="text-center border-none shadow-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
              <CardContent className="p-8">
                <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-6">
                  <Users className="h-7 w-7 text-white" strokeWidth={2} />
                </div>
                <h3 className="font-bold text-xl mb-3">High-Impact Connections</h3>
                <p className="text-sm text-white/90 leading-relaxed">
                  We make it easier to reach the people that can move you forward.
                </p>
              </CardContent>
            </Card>

            {/* Innovation First */}
            <Card className="text-center border-none shadow-lg bg-gradient-to-br from-pink-500 to-orange-500 text-white hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
              <CardContent className="p-8">
                <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-6">
                  <Lightbulb className="h-7 w-7 text-white" strokeWidth={2} />
                </div>
                <h3 className="font-bold text-xl mb-3">Innovation First</h3>
                <p className="text-sm text-white/90 leading-relaxed">
                  We're constantly building and refining Offerloop with feedback from students and recruiters to make networking faster, smarter, and more personal.
                </p>
              </CardContent>
            </Card>

            {/* Human Connection */}
            <Card className="text-center border-none shadow-lg bg-gradient-to-br from-teal-500 to-green-500 text-white hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
              <CardContent className="p-8">
                <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-6">
                  <Heart className="h-7 w-7 text-white" strokeWidth={2} />
                </div>
                <h3 className="font-bold text-xl mb-3">Human Connection</h3>
                <p className="text-sm text-white/90 leading-relaxed">
                  AI makes things easier, but people make them meaningful. We keep human connection at the center of everything we create.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Story Section */}
          <Card className="border-none shadow-lg">
            <CardContent className="p-8 space-y-4">
              <h2 className="text-2xl font-semibold text-center mb-6">Our Story</h2>
              <p className="text-muted-foreground leading-relaxed">
                Offerloop is a platform built by students, for students and young professionals with one goal: to make it easier to connect with professionals, stand out, and land great opportunities.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                At USC, we saw countless students spending hours filling out spreadsheets and sending emails, and we went through the same thing ourselves. With so many applicants for every competitive role, networking is essential but the process is slow, stressful, and exhausting. Worst of all it takes away from what’s supposed to be the most exciting time of your life.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                We built Offerloop to fix that. Our platform automates the outreach process, helping students spend less time on tedious work and more time building real connections and preparing for what truly matters in their careers.
              </p>
            </CardContent>
          </Card>

          {/* CTA Section */}
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-semibold">Ready to Transform Your Recruiting Journey?</h2>
            <p className="text-muted-foreground">
              Join thousands of aspiring professionals in discovering their dream opportunities through Offerloop.ai
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default AboutUs;