import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";

const Header = () => {
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();

  return (
    <header className="glass-nav border-b border-border relative z-20 rounded-none bg-transparent">
      <div className="w-full flex h-16 items-center justify-between px-6 relative">
        <div className="flex items-center gap-6">
          {/* Navigation can go here if needed */}
        </div>
        <div className="flex items-center gap-4">
          {!user && (
            <>
              <Button variant="ghost" onClick={() => navigate("/signin")} className="text-foreground hover:text-primary">
                Sign In
              </Button>
              <Button onClick={() => navigate("/signin")} className="text-white hover:opacity-90" style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}>
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