import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { useTheme } from "@/contexts/ThemeContext";

const Header = () => {
  const navigate = useNavigate();
  const { user, signOut, isLoading } = useFirebaseAuth();
  const { theme } = useTheme();

  const handleSignOut = () => {
    signOut();
    navigate("/home");
  };

  return (
    <header className="glass-nav border-b border-border relative z-10 rounded-none">
      <div className="w-full flex h-16 items-center justify-between px-6 relative">
        <div className="flex items-center gap-6">
          {/* Navigation can go here if needed */}
        </div>
        <div className="flex items-center gap-4">
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              <span className="text-sm text-muted-foreground">Loading...</span>
            </div>
          ) : user ? (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Avatar className="w-8 h-8 border-2 border-primary">
                  {user.picture ? (
                    <AvatarImage src={user.picture} alt={user.name} />
                  ) : null}
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                    {user.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || user.email?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium text-foreground">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
              </div>
              
              <Button 
                variant="ghost" 
                onClick={handleSignOut}
                className="text-foreground hover:text-primary"
              >
                Sign Out
              </Button>
            </div>
          ) : (
            <>
              <Button variant="ghost" onClick={() => navigate("/signin")} className="text-foreground hover:text-primary">
                Sign In
              </Button>
              <Button onClick={() => navigate("/signin")} className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white">
                Sign Up
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;