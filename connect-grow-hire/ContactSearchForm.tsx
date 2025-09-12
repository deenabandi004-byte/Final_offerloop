// src/components/ContactSearchForm.tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, Mail, Users } from "lucide-react";
import { apiService, type ContactSearchRequest, type ProContactSearchRequest } from "@/services/api";
import { useToast } from "@/hooks/use-toast";

const searchSchema = z.object({
  jobTitle: z.string().min(1, "Job title is required"),
  company: z.string().min(1, "Company is required"),
  location: z.string().min(1, "Location is required"),
  tier: z.enum(["basic", "advanced", "pro"]),
  resume: z.any().optional(),
});

type SearchFormData = z.infer<typeof searchSchema>;

export const ContactSearchForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { toast } = useToast();

  const form = useForm<SearchFormData>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      jobTitle: "",
      company: "",
      location: "",
      tier: "basic",
    },
  });

  const selectedTier = form.watch("tier");

  const onSubmit = async (data: SearchFormData) => {
    setIsLoading(true);

    try {
      const baseRequest: ContactSearchRequest = {
        jobTitle: data.jobTitle,
        company: data.company,
        location: data.location,
        uid: `user-${Date.now()}`,
      };

      let csvBlob: Blob;
      let filename: string;

      switch (data.tier) {
        case "basic":
          csvBlob = await apiService.runBasicSearch(baseRequest);
          filename = `RecruitEdge_Basic_${new Date().toISOString().slice(0, 10)}.csv`;
          break;
        case "advanced":
          csvBlob = await apiService.runAdvancedSearch(baseRequest);
          filename = `RecruitEdge_Advanced_${new Date().toISOString().slice(0, 10)}.csv`;
          break;
        case "pro":
          if (!selectedFile) {
            toast({
              title: "Resume Required",
              description: "Please upload a resume for Pro tier search",
              variant: "destructive",
            });
            return;
          }
          const proRequest: ProContactSearchRequest = { ...baseRequest, resume: selectedFile };
          csvBlob = await apiService.runProSearch(proRequest);
          filename = `RecruitEdge_Pro_${new Date().toISOString().slice(0, 10)}.csv`;
          break;
        default:
          throw new Error("Invalid tier selected");
      }

      apiService.downloadCsv(csvBlob, filename);

      toast({
        title: "Search Complete!",
        description: `${data.tier.charAt(0).toUpperCase() + data.tier.slice(1)} search completed. CSV downloaded and ${data.tier !== 'basic' ? 'Gmail drafts created' : 'contacts exported'}.`,
      });

    } catch (error) {
      console.error("Search failed:", error);
      toast({
        title: "Search Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        toast({
          title: "Invalid File Type",
          description: "Please upload a PDF file",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const tierFeatures = {
    basic: {
      contacts: 6,
      features: ["Basic contact info", "CSV export"],
      color: "bg-blue-500",
      icon: <Users className="h-4 w-4" />,
    },
    advanced: {
      contacts: 8,
      features: ["Enriched data", "AI emails", "Gmail drafts"],
      color: "bg-green-500",
      icon: <Mail className="h-4 w-4" />,
    },
    pro: {
      contacts: 12,
      features: ["Resume analysis", "Similarity engine", "Smart subjects"],
      color: "bg-purple-500",
      icon: <Upload className="h-4 w-4" />,
    },
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center">Find Your Next Connection</CardTitle>
        <p className="text-center text-muted-foreground">
          Search for professionals and get personalized outreach campaigns
        </p>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Tier Selection */}
            <FormField
              control={form.control}
              name="tier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Select Tier</FormLabel>
                  <div className="grid grid-cols-3 gap-4">
                    {Object.entries(tierFeatures).map(([tier, info]) => (
                      <div
                        key={tier}
                        className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                          field.value === tier
                            ? "border-primary bg-primary/10"
                            : "border-muted hover:border-primary/50"
                        }`}
                        onClick={() => field.onChange(tier)}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {info.icon}
                          <span className="font-semibold capitalize">{tier}</span>
                        </div>
                        <Badge variant="outline" className="mb-2">
                          {info.contacts} contacts
                        </Badge>
                        <div className="text-sm text-muted-foreground">
                          {info.features.map((feature, idx) => (
                            <div key={idx}>• {feature}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Search Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="jobTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Investment Banking Analyst" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company</FormLabel>
                    <FormControl>
                      <Input placeholder="Goldman Sachs" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input placeholder="New York, NY" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Resume Upload for Pro Tier */}
            {selectedTier === "pro" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Resume (PDF)</label>
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6">
                  <div className="text-center">
                    <Upload className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <div className="mt-4">
                      <label htmlFor="resume-upload" className="cursor-pointer">
                        <span className="text-sm font-medium text-primary hover:text-primary/80">
                          Upload your resume
                        </span>
                        <input
                          id="resume-upload"
                          type="file"
                          accept=".pdf"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </label>
                      <p className="text-xs text-muted-foreground mt-1">PDF files only</p>
                    </div>
                    {selectedFile && (
                      <div className="mt-2 text-sm text-green-600">
                        ✓ {selectedFile.name} selected
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <Button type="submit" disabled={isLoading} className="w-full" size="lg">
              {isLoading ? (
                "Searching..."
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Start {selectedTier.charAt(0).toUpperCase() + selectedTier.slice(1)} Search
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};