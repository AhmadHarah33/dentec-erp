import { mailEnabled } from "@/lib/mail";
import { ForgotClient } from "./forgot-client";

export default function ForgotPage() {
  return <ForgotClient mailEnabled={mailEnabled()} />;
}
