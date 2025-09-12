import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";

const Header = () => {
  const navigate = useNavigate();
  const { user, signOut, isLoading } = useFirebaseAuth();

  const handleSignOut = () => {
    signOut();
    navigate("/home");
  };

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 relative z-10">
      <div className="container flex h-16 items-center justify-between px-6 relative">
        <div className="flex items-center h-full overflow-hidden">
          <img 
            src="logo.png" 
            alt="Offerloop.ai" 
            className="h-40 w-auto object-contain cursor-pointer"
            onClick={() => navigate("/home")}
          />
        </div>
        
        <div className="flex items-center gap-4">
          {isLoading ? (
            // Loading state
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
              <span className="text-sm text-gray-500">Loading...</span>
            </div>
          ) : user ? (
            // User is signed in - show profile and sign out
            <div className="flex items-center gap-4">
              {/* User Profile */}
              <div className="flex items-center gap-2">
                <img 
                  src={user.picture} 
                  alt={user.name}
                  className="w-8 h-8 rounded-full border-2 border-blue-500"
                />
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
              </div>
              
              {/* Sign Out Button */}
              <Button 
                variant="ghost" 
                onClick={handleSignOut}
                className="text-gray-700 hover:text-gray-900"
              >
                Sign Out
              </Button>
            </div>
          ) : (
            // User is NOT signed in - show sign in/up buttons
            <>
              <Button variant="ghost" onClick={() => navigate("/signin")}>
                Sign In
              </Button>
              <Button onClick={() => navigate("/signin")}>
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