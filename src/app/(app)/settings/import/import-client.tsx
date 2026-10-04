"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import { previewImport, runImport, type ImportPreview } from "@/app/actions/import";
import { IMPORT_KINDS, MAX_IMPORT_ROWS, templateCsv, toRecords, type ImportKind } from "@/lib/import/kinds";
import { parseCsv } from "@/lib/import/csv";
import { PageHeader } from "@/components/ui/page";
import { Badge, Button, Card, CardHeader, Field, Num, Select } from "@/components/ui/primitives";
import { PageTabs } from "@/components/ui/tabs";
import { SETTINGS_TABS } from "@/lib/tabs";
import { IconDownload } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";

type Records = Record<string, string>[];

/** A cell from a spreadsheet as the text the importer reads. */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

async function readFile(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    // Loaded only when an Excel file is chosen: most imports are CSV.
    const { readSheet } = await import("read-excel-file/browser");
    const rows = await readSheet(file);
    return rows.map((row) => row.map(cellText));
  }
  return parseCsv(await file.text());
}

export function ImportClient() {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<ImportKind>("products");
  const [fileName, setFileName] = useState("");
  const [records, setRecords] = useState<Records | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function reset(nextKind = kind) {
    setKind(nextKind);
    setFileName("");
    setRecords(null);
    setPreview(null);
    setProblem(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function downloadTemplate() {
    const blob = new Blob([templateCsv(kind)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dentec-${kind}-template.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function onFile(file: File | undefined) {
    setPreview(null);
    setRecords(null);
    setProblem(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const parsed = toRecords(kind, await readFile(file));
      if (parsed.missing.length > 0) {
        setProblem(t("import.missingColumns", { cols: parsed.missing.join(", ") }));
        return;
      }
      if (parsed.records.length === 0) {
        setProblem(t("import.empty"));
        return;
      }
      if (parsed.records.length > MAX_IMPORT_ROWS) {
        setProblem(t("import.tooMany", { max: MAX_IMPORT_ROWS }));
        return;
      }
      setRecords(parsed.records);
      startTransition(async () => {
        const result = await previewImport(kind, parsed.records);
        if (result.ok) setPreview(result.data);
        else setProblem(t(result.errorKey as MessageKey));
      });
    } catch {
      setProblem(t("import.badFile"));
    }
  }

  function confirm() {
    if (!records) return;
    setProblem(null);
    startTransition(async () => {
      const result = await runImport(kind, records);
      if (result.ok) {
        toast(t("import.done", { n: result.data.count }));
        reset();
        router.refresh();
      } else {
        setProblem(t(result.errorKey as MessageKey));
        // The data moved under the file: check it again against what is there now.
        const again = await previewImport(kind, records);
        if (again.ok) setPreview(again.data);
      }
    });
  }

  const bad = preview?.results.filter((r) => r.errors.length > 0) ?? [];

  return (
    <>
      <PageHeader title={t("nav.settings")} subtitle={t("import.subtitle")} />
      <PageTabs tabs={SETTINGS_TABS.map((x) => ({ href: x.href, label: t(x.labelKey) }))} />

      <Card className="mb-4">
        <CardHeader title={t("import.step1")} />
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <Field label={t("import.kind")}>
            <Select value={kind} onChange={(e) => reset(e.target.value as ImportKind)}>
              {IMPORT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`import.kind.${k}` as MessageKey)}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <Button onClick={downloadTemplate}>
              <IconDownload />
              {t("import.template")}
            </Button>
          </div>
          <p className="text-2xs text-muted sm:col-span-2">{t(`import.hint.${kind}` as MessageKey)}</p>
        </div>
      </Card>

      <Card className="mb-4">
        <CardHeader title={t("import.step2")} />
        <div className="p-4 space-y-3">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.xlsx,text/csv"
            onChange={(e) => onFile(e.target.files?.[0])}
            className="block w-full text-xs file:me-3 file:h-10 file:rounded-sm file:border file:border-line file:bg-surface file:px-4 file:text-xs file:font-medium hover:file:border-line-strong"
          />
          {fileName && <p className="text-2xs text-muted">{fileName}</p>}
          {problem && <p className="text-2xs text-danger border border-danger-soft bg-danger-soft rounded-sm p-2">{problem}</p>}
          {pending && !preview && <p className="text-2xs text-faint">{t("audit.loading")}</p>}
        </div>
      </Card>

      {preview && (
        <Card>
          <CardHeader
            title={t("import.step3")}
            meta={t("import.rows", { n: preview.results.length })}
            action={
              preview.ok ? (
                <Button variant="primary" onClick={confirm} disabled={pending}>
                  {t("import.run", { n: preview.count })}
                </Button>
              ) : undefined
            }
          />
          <div className="p-4">
            {preview.ok ? (
              <p className="text-xs">
                <Badge tone="success">{t("import.allValid")}</Badge>
              </p>
            ) : (
              <>
                <p className="text-xs mb-3">
                  <Badge tone="danger">{t("import.invalid", { n: bad.length })}</Badge>{" "}
                  <span className="text-muted">{t("import.fixHint")}</span>
                </p>
                <div className="divide-y divide-line border border-line rounded-sm">
                  {bad.slice(0, 100).map((r) => (
                    <div key={r.line} className="px-3 py-2 text-xs">
                      <div className="flex gap-3">
                        <span className="text-faint">
                          {t("import.line")} <Num>{r.line}</Num>
                        </span>
                        <span className="font-medium">
                          <Num>{r.label || "—"}</Num>
                        </span>
                      </div>
                      <ul className="mt-1 text-2xs text-danger">
                        {r.errors.map((e, i) => (
                          <li key={i}>
                            <Num>{e.field}</Num>: {t(`import.err.${e.code}` as MessageKey)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {bad.length > 100 && (
                    <p className="px-3 py-2 text-2xs text-muted">{t("import.more", { n: bad.length - 100 })}</p>
                  )}
                </div>
              </>
            )}
          </div>
        </Card>
      )}
    </>
  );
}
