import { LandingAuthProvider } from "@/components/marketing/landing-auth";
import { LandingPage } from "@/components/marketing/landing-sections";
import {
  isGoogleAuthConfigured,
  isPublicSignupAllowed,
} from "@/lib/auth/public-signup";

export default function HomePage() {
  return (
    <LandingAuthProvider
      allowCreate={isPublicSignupAllowed()}
      googleEnabled={isGoogleAuthConfigured()}
    >
      <LandingPage />
    </LandingAuthProvider>
  );
}
