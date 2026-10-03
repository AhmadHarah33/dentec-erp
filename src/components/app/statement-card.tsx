"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/context";
import { Card, CardHeader, Field } from "@/components/ui/primitives";
import { DateInput } from "@/components/ui/date-input";
import { LinkButton } from "@/components/ui/primitives";
import { DownloadPdfButton } from "@/components/app/download-pdf";
import { today } from "@/lib/dates";

/** Pick a period and open or download a customer's statement. */
export function StatementCard({ customerId }: { customerId: string }) {
  const t = useT();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(today());

  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const q = query.size ? `?${query}` : "";

  return (
    <Card className="mb-4 no-print">
      <CardHeader title={t("statement.card")} />
      <div className="p-4 space-y-4">
        <p className="text-2xs text-muted">{t("statement.cardHint")}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("label.fromDate")}>
            <DateInput value={from} onChange={setFrom} clearable />
          </Field>
          <Field label={t("label.toDate")}>
            <DateInput value={to} onChange={setTo} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/print/statement/${customerId}${q}`} target="_blank">
            {t("statement.open")}
          </LinkButton>
          <DownloadPdfButton id={customerId} href={`/api/customers/${customerId}/statement/pdf${q}`} />
        </div>
      </div>
    </Card>
  );
}
