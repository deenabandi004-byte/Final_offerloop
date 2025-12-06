import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { ArrowLeft, Mail, Phone, Linkedin, Twitter, Clock } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const Contact = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    reason: "",
    message: ""
  });
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.name || !formData.email || !formData.message) {
      toast({
        title: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    // Here you would typically send the form data to your backend
    toast({
      title: "Message sent successfully!",
      description: "We'll get back to you within 3 business days.",
    });
    
    // Reset form
    setFormData({ name: "", email: "", reason: "", message: "" });
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-6 py-16">
        <div className="max-w-4xl mx-auto space-y-12">
          {/* Back Button */}
          <div className="flex justify-start">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/" className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
          </div>

          {/* Hero Section */}
          <div className="text-center space-y-6">
            
            <h2 className="text-5xl font-extrabold text-center bg-gradient-to-r from-blue-800 via-blue-400 to-purple-900 bg-clip-text text-transparent mb-6">
              Contact Us
            </h2>

            <p className="text-xl text-muted-foreground leading-relaxed max-w-3xl mx-auto">
              Have questions about Offerloop.ai? We'd love to hear from you. Send us a message and we'll respond within 3 business days.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Contact Form */}
            <Card>
              <CardHeader>
                <CardTitle>Send us a message</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => handleInputChange("name", e.target.value)}
                      placeholder="Your full name"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      placeholder="your.email@example.com"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reason">Reason for Contact</Label>
                    <Select value={formData.reason} onValueChange={(value) => handleInputChange("reason", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a reason (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="support">Support</SelectItem>
                        <SelectItem value="partnerships">Partnerships</SelectItem>
                        <SelectItem value="media">Media</SelectItem>
                        <SelectItem value="feedback">Feedback</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Message *</Label>
                    <Textarea
                      id="message"
                      value={formData.message}
                      onChange={(e) => handleInputChange("message", e.target.value)}
                      placeholder="Tell us about your inquiry, feedback, or questions..."
                      className="min-h-[120px]"
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full">
                    Send Message
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <div className="space-y-6">
              {/* Direct Contact Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Get in touch</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">Support</p>
                      <p className="text-sm text-muted-foreground">support@offerloop.ai</p>
                    </div>
                  </div>
                  
              

                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">Phone</p>
                      <p className="text-sm text-muted-foreground">(503) 616-1981</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Response Time */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">Response Time</p>
                      <p className="text-sm text-muted-foreground">We typically reply within 3 business days</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Social Links */}
              <Card>
                <CardHeader>
                  <CardTitle>Connect with us</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4">
                    <Button variant="outline" size="icon" asChild>
                      <a href="https://linkedin.com/company/offerloop-ai" target="_blank" rel="noopener noreferrer">
                        <Linkedin className="h-4 w-4" />
                      </a>
                    </Button>
                   
                  </div>
                  <p className="text-sm text-muted-foreground mt-4">
                    Follow us for updates and insights about recruiting and career development.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Contact;