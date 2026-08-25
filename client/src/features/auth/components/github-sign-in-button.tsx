import { Github } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function GithubSignInButton() {
  return (
    <Button asChild variant="outline" className="w-full">
      <a href="/api/auth/github">
        <Github />
        Continue with GitHub
      </a>
    </Button>
  );
}
