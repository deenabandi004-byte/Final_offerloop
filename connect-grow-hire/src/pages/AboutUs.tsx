import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

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
                To give students a competitive edge in recruiting—helping them land the best opportunities while saving time for what matters most. By combining advanced technology with human insight, we make it easy to cut through the noise, focus on real connections, and build a career you're excited about.
              </p>
            </CardContent>
          </Card>

          {/* Values Grid */}
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="text-center">
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">👥</span>
                </div>
                <h3 className="font-semibold mb-2">High-Impact Connections</h3>
                <p className="text-sm text-muted-foreground">
                  We connect you directly with the professionals who matter, so every conversation moves you closer to your goals.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🚀</span>
                </div>
                <h3 className="font-semibold mb-2">Innovation First</h3>
                <p className="text-sm text-muted-foreground">
                  We continuously evolve our platform with the latest technology and industry insights.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🤝</span>
                </div>
                <h3 className="font-semibold mb-2">Human Connection</h3>
                <p className="text-sm text-muted-foreground">
                  Technology enhances, but human relationships remain at the heart of what we do.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Story Section */}
          <Card className="border-none shadow-lg">
            <CardContent className="p-8 space-y-4">
              <h2 className="text-2xl font-semibold text-center mb-6">Our Story</h2>
              <p className="text-muted-foreground leading-relaxed">
                Offerloop.ai started as a simple idea between two college friends who felt the pain of recruiting firsthand. After watching our classmates spend countless hours on applications—and coming up short ourselves—we realized the process was broken. With hundreds of applicants for every role, we saw that the only real way in was through genuine connections with people inside the companies.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Like many students, we struggled to land internships, felt discouraged, and asked ourselves: why does recruiting have to take so much time and effort? We wanted to make things better, not just for ourselves, but for everyone in our shoes. So we started building a tool to automate the outreach process, helping students spend less time on tedious tasks and more time on meaningful conversations.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                That's how Offerloop.ai (originally called RecruitEdge) was born: a platform built by students, for students, with one goal—make it easier to connect, stand out, and land great opportunities.
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