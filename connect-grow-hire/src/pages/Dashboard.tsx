import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Progress } from "@/components/ui/progress";

// Badge tier definitions
const badgeTiers = [
  { name: "Rookie", threshold: 1, color: "bg-blue-500", colorVar: "--badge-rookie" },
  { name: "Scout", threshold: 21, color: "bg-green-500", colorVar: "--badge-scout" },
  { name: "Challenger", threshold: 50, color: "bg-purple-500", colorVar: "--badge-challenger" },
  { name: "Pro", threshold: 100, color: "bg-yellow-500", colorVar: "--badge-pro" },
  { name: "Elite", threshold: 150, color: "bg-gray-600", colorVar: "--badge-elite" },
];

// Mock data for networking progress
const monthlyData = [
  { date: "Week 1", connections: 5 },
  { date: "Week 2", connections: 12 },
  { date: "Week 3", connections: 18 },
  { date: "Week 4", connections: 25 },
];

const allTimeData = [
  { date: "Jan", connections: 8 },
  { date: "Feb", connections: 15 },
  { date: "Mar", connections: 28 },
  { date: "Apr", connections: 45 },
  { date: "May", connections: 62 },
  { date: "Jun", connections: 78 },
  { date: "Jul", connections: 95 },
  { date: "Aug", connections: 125 },
];

// Circular progress component
const CircularProgress = ({ 
  value, 
  max, 
  size = 120, 
  strokeWidth = 8, 
  color = "hsl(var(--dashboard-primary))",
  label,
  description 
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label: string;
  description: string;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percentage = (value / max) * 100;
  const strokeDasharray = `${circumference} ${circumference}`;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          className="transform -rotate-90"
          width={size}
          height={size}
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-300 ease-in-out"
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-foreground">
            {value.toLocaleString()}
          </span>
          <span className="text-sm text-muted-foreground">
            of {max.toLocaleString()}
          </span>
        </div>
      </div>
      <div className="mt-4 text-center">
        <p className="font-medium text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [timeframe, setTimeframe] = useState("monthly");
  const [additionalCreditsEnabled, setAdditionalCreditsEnabled] = useState(false);
  
  // Mock user data
  const currentConnections = 125;
  const currentTier = "Pro";
  const currentBadge = badgeTiers.find(tier => 
    currentConnections >= tier.threshold && 
    (badgeTiers.indexOf(tier) === badgeTiers.length - 1 || 
     currentConnections < badgeTiers[badgeTiers.indexOf(tier) + 1]?.threshold)
  ) || badgeTiers[0];

  const creditsRemaining = 63800;
  const totalCredits = 75000;
  const additionalCredits = 0;
  const maxAdditionalCredits = 150000;

  const chartData = timeframe === "monthly" ? monthlyData : allTimeData;

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Back Arrow */}
      <div className="max-w-7xl mx-auto mb-4">
        <Button 
          variant="ghost" 
          onClick={() => navigate("/home")} 
          className="p-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Button>
      </div>

      <div className="max-w-7xl mx-auto space-y-8">
        {/* Centered Header */}
        <div className="text-center space-y-3 py-8">
          <h1 className="text-4xl font-bold text-foreground">Dashboard</h1>
          <p className="text-xl text-muted-foreground">
            Track your networking progress and recruiting success in one place.
          </p>
        </div>

        {/* Subscription Tier & Badge */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Current Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Subscription:</span>
                <Badge variant="secondary" className="text-sm font-semibold">
                  {currentTier}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Badge:</span>
                <Badge 
                  className={`${currentBadge.color} text-white font-semibold`}
                  style={{ backgroundColor: `hsl(var(${currentBadge.colorVar}))` }}
                >
                  {currentBadge.name}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Networking Progress Graph */}
        <Card className="shadow-card">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Networking Progress</CardTitle>
              <ToggleGroup
                type="single"
                value={timeframe}
                onValueChange={(value) => value && setTimeframe(value)}
              >
                <ToggleGroupItem value="monthly" aria-label="Monthly view">
                  Monthly
                </ToggleGroupItem>
                <ToggleGroupItem value="alltime" aria-label="All time view">
                  Since Creation
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    label={{ value: 'Connections', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="connections" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, stroke: 'hsl(var(--primary))', strokeWidth: 2 }}
                  />
                  {/* Badge threshold lines */}
                  {badgeTiers.map((tier) => (
                    <ReferenceLine 
                      key={tier.name}
                      y={tier.threshold} 
                      stroke={`hsl(var(${tier.colorVar}))`}
                      strokeDasharray="5 5"
                      label={{ value: tier.name, position: "insideTopRight" }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Credits & Activity Circles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card className="shadow-card">
            <CardContent className="pt-6">
              <CircularProgress
                value={creditsRemaining}
                max={totalCredits}
                color="hsl(var(--dashboard-primary))"
                label="Credits Remaining"
                description="Included in your tier"
              />
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Additional Credits</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {additionalCreditsEnabled ? "Enabled" : "Disabled"}
                  </span>
                  <Switch
                    checked={additionalCreditsEnabled}
                    onCheckedChange={setAdditionalCreditsEnabled}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <CircularProgress
                value={additionalCredits}
                max={maxAdditionalCredits}
                color="hsl(var(--dashboard-secondary))"
                label="Additional Credits Used"
                description="$0.005 per credit"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;