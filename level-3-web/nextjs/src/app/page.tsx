import { ChatInterface } from "@/components/chat-interface";

/**
 * Home Page
 * ---------
 * The root page simply renders the ChatInterface component.
 * All chat logic lives inside ChatInterface and its children.
 */
export default function Home() {
  return <ChatInterface />;
}
