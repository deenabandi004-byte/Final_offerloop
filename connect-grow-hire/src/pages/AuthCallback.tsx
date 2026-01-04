import { useEffect } from 'react';
import { LoadingContainer } from '@/components/ui/LoadingBar';

const AuthCallback = () => {
  useEffect(() => {
    // Extract authorization code from URL
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');

    if (error) {
      // Send error to parent window
      window.opener?.postMessage({
        type: 'GOOGLE_AUTH_ERROR',
        error: error,
      }, window.location.origin);
    } else if (code) {
      // Send success code to parent window
      window.opener?.postMessage({
        type: 'GOOGLE_AUTH_SUCCESS',
        code: code,
      }, window.location.origin);
    }
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <LoadingContainer 
        label="Completing authentication..." 
        sublabel="Please wait" 
      />
    </div>
  );
};

export default AuthCallback;