import { notFound } from 'next/navigation';
import { PublicChatView } from '@/components/chat/public-chat-view';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface EmbedPageProps {
  params: {
    key: string;
  };
}

async function getWidgetConfig(key: string) {
  try {
    const res = await fetch(`${API_BASE}/public/widget/${key}/config`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as {
      workspaceName: string;
      welcomeText: string;
      allowedOrigins: string[];
    };
  } catch {
    return null;
  }
}

export default async function EmbedPage({ params }: EmbedPageProps) {
  const config = await getWidgetConfig(params.key);
  if (!config) {
    notFound();
  }

  return (
    <main className="h-screen w-screen flex flex-col bg-white dark:bg-gray-950 overflow-hidden">
      <PublicChatView
        isWidget={true}
        widgetKey={params.key}
        workspaceName={config.workspaceName}
        welcomeText={config.welcomeText}
      />
    </main>
  );
}
