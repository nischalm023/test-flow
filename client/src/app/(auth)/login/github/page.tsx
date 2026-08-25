import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { GithubComplete } from '@/features/auth/components/github-complete';

export default function GithubLoginCompletePage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>GitHub</CardTitle>
        <CardDescription>Finishing your sign-in</CardDescription>
      </CardHeader>
      <CardContent>
        <GithubComplete />
      </CardContent>
    </Card>
  );
}
