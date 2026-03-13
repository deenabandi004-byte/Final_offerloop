export interface SeoUniversity {
  name: string;
  slug: string;
  full_name: string;
  location: string;
  business_school: string;
  notable_programs: string[];
  top_employers: string[];
}

export const seoUniversities: SeoUniversity[] = [
  { name: "USC", slug: "usc", full_name: "University of Southern California", location: "Los Angeles, CA", business_school: "Marshall School of Business", notable_programs: ["Business", "Engineering", "Cinema"], top_employers: ["Goldman Sachs", "McKinsey", "Google", "Deloitte"] },
  { name: "UCLA", slug: "ucla", full_name: "University of California Los Angeles", location: "Los Angeles, CA", business_school: "Anderson School of Management", notable_programs: ["Business", "Engineering", "Pre-Med"], top_employers: ["Google", "BCG", "JPMorgan", "Amazon"] },
  { name: "University of Michigan", slug: "michigan", full_name: "University of Michigan", location: "Ann Arbor, MI", business_school: "Ross School of Business", notable_programs: ["Business", "Engineering", "Law"], top_employers: ["Goldman Sachs", "McKinsey", "Google", "Ford"] },
  { name: "NYU", slug: "nyu", full_name: "New York University", location: "New York, NY", business_school: "Stern School of Business", notable_programs: ["Finance", "Business", "Arts"], top_employers: ["Goldman Sachs", "JPMorgan", "Morgan Stanley", "Blackstone"] },
  { name: "Georgetown", slug: "georgetown", full_name: "Georgetown University", location: "Washington, DC", business_school: "McDonough School of Business", notable_programs: ["International Relations", "Business", "Law"], top_employers: ["McKinsey", "Deloitte", "JPMorgan", "US Government"] },
  { name: "UPenn", slug: "upenn", full_name: "University of Pennsylvania", location: "Philadelphia, PA", business_school: "Wharton School", notable_programs: ["Finance", "Business", "Engineering"], top_employers: ["Goldman Sachs", "McKinsey", "Bain", "Blackstone"] },
  { name: "Duke", slug: "duke", full_name: "Duke University", location: "Durham, NC", business_school: "Fuqua School of Business", notable_programs: ["Business", "Engineering", "Pre-Med"], top_employers: ["McKinsey", "Goldman Sachs", "Google", "Deloitte"] },
  { name: "University of Virginia", slug: "uva", full_name: "University of Virginia", location: "Charlottesville, VA", business_school: "Darden School of Business", notable_programs: ["Business", "Law", "Engineering"], top_employers: ["McKinsey", "BCG", "Capital One", "Deloitte"] },
  { name: "UT Austin", slug: "ut-austin", full_name: "University of Texas at Austin", location: "Austin, TX", business_school: "McCombs School of Business", notable_programs: ["Business", "Engineering", "Computer Science"], top_employers: ["Dell", "Google", "Goldman Sachs", "Deloitte"] },
  { name: "UC Berkeley", slug: "berkeley", full_name: "UC Berkeley", location: "Berkeley, CA", business_school: "Haas School of Business", notable_programs: ["Engineering", "Business", "Computer Science"], top_employers: ["Google", "Apple", "Goldman Sachs", "McKinsey"] },
  { name: "Northwestern", slug: "northwestern", full_name: "Northwestern University", location: "Evanston, IL", business_school: "Kellogg School of Management", notable_programs: ["Business", "Engineering", "Journalism"], top_employers: ["McKinsey", "Goldman Sachs", "Google", "Deloitte"] },
  { name: "Notre Dame", slug: "notre-dame", full_name: "University of Notre Dame", location: "Notre Dame, IN", business_school: "Mendoza College of Business", notable_programs: ["Business", "Engineering", "Pre-Law"], top_employers: ["Deloitte", "EY", "JPMorgan", "Accenture"] },
  { name: "Emory", slug: "emory", full_name: "Emory University", location: "Atlanta, GA", business_school: "Goizueta Business School", notable_programs: ["Business", "Pre-Med", "Economics"], top_employers: ["Goldman Sachs", "McKinsey", "CDC", "Delta"] },
  { name: "Vanderbilt", slug: "vanderbilt", full_name: "Vanderbilt University", location: "Nashville, TN", business_school: "Owen Graduate School of Management", notable_programs: ["Business", "Pre-Med", "Law"], top_employers: ["Deloitte", "Goldman Sachs", "McKinsey", "HCA Healthcare"] },
  { name: "Cornell", slug: "cornell", full_name: "Cornell University", location: "Ithaca, NY", business_school: "Dyson School of Applied Economics", notable_programs: ["Engineering", "Business", "Hotel Administration"], top_employers: ["Goldman Sachs", "Google", "McKinsey", "Amazon"] },
  { name: "Columbia", slug: "columbia", full_name: "Columbia University", location: "New York, NY", business_school: "Columbia Business School", notable_programs: ["Finance", "Engineering", "Pre-Med"], top_employers: ["Goldman Sachs", "McKinsey", "JPMorgan", "Blackstone"] },
  { name: "Harvard", slug: "harvard", full_name: "Harvard University", location: "Cambridge, MA", business_school: "Harvard Business School", notable_programs: ["Economics", "Computer Science", "Government"], top_employers: ["McKinsey", "Goldman Sachs", "Bain", "Google"] },
  { name: "Yale", slug: "yale", full_name: "Yale University", location: "New Haven, CT", business_school: "Yale School of Management", notable_programs: ["Economics", "Political Science", "Law"], top_employers: ["McKinsey", "Goldman Sachs", "Morgan Stanley", "Bridgewater"] },
  { name: "Princeton", slug: "princeton", full_name: "Princeton University", location: "Princeton, NJ", business_school: "Bendheim Center for Finance", notable_programs: ["Economics", "Engineering", "Public Policy"], top_employers: ["Goldman Sachs", "McKinsey", "Two Sigma", "Jane Street"] },
  { name: "University of Chicago", slug: "uchicago", full_name: "University of Chicago", location: "Chicago, IL", business_school: "Booth School of Business", notable_programs: ["Economics", "Statistics", "Computer Science"], top_employers: ["Goldman Sachs", "McKinsey", "Citadel", "Two Sigma"] },
];
