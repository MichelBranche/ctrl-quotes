import { AuthScreen } from "@/components/auth/auth-screen";
import { InviteView } from "@/components/invite/invite-view";
import { ensureMigrated, getDb } from "@/db/client";
import { isWellFormedToken } from "@/server/link-token";
import { previewInvite } from "@/server/invites";
import { readSession } from "@/server/session";

const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });

export const metadata = { title: "Invito al team" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await ensureMigrated();
  if (!isWellFormedToken(token)) {
    return (
      <AuthScreen>
        <InviteView token="" preview={null} session={null} />
      </AuthScreen>
    );
  }
  const [preview, session] = await Promise.all([previewInvite(getDb(), token), readSession()]);
  const view = preview
    ? { ...preview, expiresLabel: dateFormat.format(preview.expiresAt) }
    : null;
  return (
    <AuthScreen>
      <InviteView
        token={token}
        preview={view}
        session={session ? { email: session.user.email, name: session.user.name } : null}
      />
    </AuthScreen>
  );
}
