"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/context";
import { Button } from "@/components/ui/primitives";
import { IconDownload } from "@/components/ui/icons";

/**
 * Fetches the PDF and hands it to the browser as a save.
 *
 * A plain `<a download>` would be simpler, but the route can fail — a missing
 * Chromium on a fresh checkout is the usual reason — and a link has nowhere
 * to put that. Fetching lets the button say "preparing", then either save the
 * file or report why it could not, instead of navigating away to a JSON error.
 */
export function DownloadPdfButton({
  kind,
  id,
}: {
  kind: "invoices" | "purchases";
  id: string;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/${kind}/${id}/pdf`);
      if (!response.ok) throw new Error(String(response.status));

      const blob = await response.blob();
      // The server already worked out the filename; reuse it so the download
      // is named after the document rather than after the route.
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = /filename\*=UTF-8''([^;]+)/.exec(disposition);
      const filename = match ? decodeURIComponent(match[1]) : `${id}.pdf`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Revoking immediately can cancel the save in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={download} disabled={busy}>
      <IconDownload />
      {busy ? t("print.preparing") : failed ? t("print.failed") : t("print.download")}
    </Button>
  );
}
