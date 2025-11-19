import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h1 className="text-5xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
            Admin Panel
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Professional social media management platform. Create, schedule, and publish posts with ease.
          </p>
          <div className="flex gap-4 justify-center">
            {user ? (
              <Button size="lg" asChild>
                <Link to="/dashboard">Go to Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button size="lg" asChild>
                  <Link to="/auth">Get Started</Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/auth">Sign In</Link>
                </Button>
              </>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-16">
            <div className="p-6 rounded-lg bg-card border">
              <h3 className="text-xl font-semibold mb-2">Create Posts</h3>
              <p className="text-muted-foreground">
                Easily create and manage your social media content
              </p>
            </div>
            <div className="p-6 rounded-lg bg-card border">
              <h3 className="text-xl font-semibold mb-2">Schedule</h3>
              <p className="text-muted-foreground">
                Plan and schedule your posts for optimal engagement
              </p>
            </div>
            <div className="p-6 rounded-lg bg-card border">
              <h3 className="text-xl font-semibold mb-2">Analytics</h3>
              <p className="text-muted-foreground">
                Track your post performance with built-in analytics
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
