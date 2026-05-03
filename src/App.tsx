import { Button, Input, SearchField } from "@heroui/react";
import { countdown, createTOTP } from "totp-auth";
import {
  Check,
  Copy,
  Download,
  KeyRound,
  LockKeyholeOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { clearRecords, deleteRecord, addRecord, loadRecords, type TotpRecord, updateRecord, upsertImportedRecords } from "./storage";
import { exportOtpAuthText, parseOtpAuthText } from "./otpauth";

type Notice = {
  tone: "success" | "error";
  message: string;
};

type DraftRecord = {
  description: string;
  secret: string;
};

const emptyDraft: DraftRecord = {
  description: "",
  secret: "",
};

function getNowSeconds() {
  return Math.ceil(Date.now() / 1000);
}

function isFuzzyMatch(value: string, query: string) {
  const normalizedValue = value.toLocaleLowerCase();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  let valueIndex = 0;

  if (!normalizedQuery) {
    return true;
  }

  for (const character of normalizedQuery) {
    valueIndex = normalizedValue.indexOf(character, valueIndex);

    if (valueIndex === -1) {
      return false;
    }

    valueIndex += 1;
  }

  return true;
}

function isTotpValid(secret: string) {
  return createTOTP(secret, undefined, "") !== "";
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function App() {
  const [records, setRecords] = useState<TotpRecord[]>([]);
  const [draft, setDraft] = useState<DraftRecord>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState("");
  const [query, setQuery] = useState("");
  const [epoch, setEpoch] = useState(getNowSeconds);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const remainingSeconds = countdown(epoch);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => isFuzzyMatch(record.description, query));
  }, [records, query]);

  async function refreshRecords() {
    setRecords(await loadRecords());
  }

  useEffect(() => {
    refreshRecords()
      .catch((error) => setNotice({ tone: "error", message: String(error) }))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setEpoch(getNowSeconds()), 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  function showNotice(notice: Notice) {
    setNotice(notice);
    window.setTimeout(() => setNotice(null), 2800);
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const description = draft.description.trim();
    const secret = draft.secret.trim();

    if (!description || !secret) {
      showNotice({ tone: "error", message: "Description and secret are required." });
      return;
    }

    if (!isTotpValid(secret)) {
      showNotice({ tone: "error", message: "Secret is not a valid TOTP key." });
      return;
    }

    try {
      await addRecord({ description, secret });
      setDraft(emptyDraft);
      await refreshRecords();
      showNotice({ tone: "success", message: "Record added." });
    } catch (error) {
      showNotice({ tone: "error", message: error instanceof DOMException && error.name === "ConstraintError" ? "Secret already exists." : String(error) });
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseOtpAuthText(text);
      const validRecords = parsed.records.filter((record) => isTotpValid(record.secret));
      const invalidCount = parsed.records.length - validRecords.length;
      const result = await upsertImportedRecords(validRecords);
      await refreshRecords();

      const problems = parsed.errors.length + invalidCount;
      const problemText = problems > 0 ? ` ${problems} line${problems === 1 ? "" : "s"} skipped.` : "";
      showNotice({
        tone: problems > 0 ? "error" : "success",
        message: `Imported ${result.added} new and updated ${result.updated}.${problemText}`,
      });
    } catch (error) {
      showNotice({ tone: "error", message: String(error) });
    } finally {
      input.value = "";
    }
  }

  function handleExport() {
    const text = exportOtpAuthText(records);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "totp-secrets.txt";
    anchor.click();
    URL.revokeObjectURL(url);
    showNotice({ tone: "success", message: "Export started." });
  }

  async function handleCopyPasscode(secret: string) {
    const passcode = createTOTP(secret);
    await copyText(passcode);
    showNotice({ tone: "success", message: "Passcode copied." });
  }

  async function handleCopySecret(secret: string) {
    await copyText(secret);
    showNotice({ tone: "success", message: "Secret copied." });
  }

  function beginEdit(record: TotpRecord) {
    setEditingId(record.id);
    setEditingDescription(record.description);
  }

  async function saveDescription(id: string) {
    const description = editingDescription.trim();

    if (!description) {
      showNotice({ tone: "error", message: "Description cannot be empty." });
      return;
    }

    await updateRecord(id, { description });
    setEditingId(null);
    await refreshRecords();
    showNotice({ tone: "success", message: "Description updated." });
  }

  async function removeRecord(id: string) {
    await deleteRecord(id);
    await refreshRecords();
    showNotice({ tone: "success", message: "Record deleted." });
  }

  async function handleClearRecords() {
    await clearRecords();
    setEditingId(null);
    await refreshRecords();
    showNotice({ tone: "success", message: "All records cleared." });
  }

  return (
    <main className="app-shell">
      <section className="top-bar" aria-label="App header">
        <div className="brand-mark" aria-hidden="true">
          <LockKeyholeOpen size={28} strokeWidth={2.2} />
        </div>
        <div>
          <h1>Web Authenticator</h1>
          <p>Private TOTP codes stored in this browser.</p>
        </div>
      </section>

      <div className="toolbar" aria-label="TOTP tools">
        <SearchField className="search-field" aria-label="Search records" value={query} onChange={setQuery}>
          <SearchField.Group>
            <Search size={16} aria-hidden="true" />
            <SearchField.Input placeholder="Search..." />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <div className="countdown" aria-label="Remaining seconds">
          {remainingSeconds}s
        </div>
        <input ref={fileInputRef} className="visually-hidden" type="file" accept=".txt,text/plain" onChange={handleImport} />
        <Button type="button" className="utility-button" variant="outline" onClick={() => fileInputRef.current?.click()}>
          <Download size={16} />
          Import
        </Button>
        <Button type="button" className="utility-button" variant="outline" onClick={handleExport} isDisabled={records.length === 0}>
          <Upload size={16} />
          Export
        </Button>
        <Button type="button" className="utility-button" variant="outline" onClick={handleClearRecords} isDisabled={records.length === 0}>
          <Trash2 size={16} />
          Clear
        </Button>
      </div>

      {notice ? (
        <div className={`notice ${notice.tone}`} role="status">
          {notice.message}
        </div>
      ) : null}

      <section className="totp-list" aria-label="TOTP records">
        <div className="list-header" role="row">
          <span role="columnheader">Passcode</span>
          <span role="columnheader">Description</span>
          <span role="columnheader">Actions</span>
        </div>

        {isLoading ? <div className="empty-state">Loading records...</div> : null}

        {!isLoading && filteredRecords.length === 0 ? (
          <div className="empty-state">{records.length === 0 ? "No TOTP records yet." : "No records match the search."}</div>
        ) : null}

        {filteredRecords.map((record) => {
          const passcode = createTOTP(record.secret);
          const isEditing = editingId === record.id;

          return (
            <article className="record-row" role="row" key={record.id}>
              <button className="passcode-button" type="button" onClick={() => handleCopyPasscode(record.secret)} aria-label={`Copy passcode for ${record.description}`}>
                <span className="passcode-number">{passcode}</span>
                <Copy size={14} aria-hidden="true" />
              </button>
              <div className="description-cell">
                {isEditing ? (
                  <>
                    <Input
                      aria-label={`Edit description for ${record.description}`}
                      value={editingDescription}
                      onChange={(event) => setEditingDescription(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void saveDescription(record.id);
                        }
                        if (event.key === "Escape") {
                          setEditingId(null);
                        }
                      }}
                    />
                  </>
                ) : (
                  <span className="description-text">{record.description}</span>
                )}
              </div>
              <div className="record-actions">
                {isEditing ? (
                  <>
                    <Button type="button" isIconOnly aria-label="Save description" onClick={() => saveDescription(record.id)}>
                      <Check size={16} />
                    </Button>
                    <Button type="button" isIconOnly aria-label="Cancel edit" onClick={() => setEditingId(null)}>
                      <X size={16} />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="button" isIconOnly variant="secondary" aria-label={`Edit ${record.description}`} onClick={() => beginEdit(record)}>
                      <Pencil size={16} />
                    </Button>
                    <Button type="button" isIconOnly variant="secondary" aria-label={`Delete ${record.description}`} onClick={() => removeRecord(record.id)}>
                      <Trash2 size={16} />
                    </Button>
                    <Button type="button" isIconOnly variant="secondary" aria-label={`Copy secret for ${record.description}`} onClick={() => handleCopySecret(record.secret)}>
                      <KeyRound size={19} />
                    </Button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <form className="add-form" aria-label="Add TOTP record" onSubmit={handleAdd}>
        <label>
          <span>Description</span>
          <Input
            className="pale-input"
            aria-label="New record description"
            value={draft.description}
            placeholder="GitHub:account"
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
          />
        </label>
        <label>
          <span>TOTP secret</span>
          <Input
            className="pale-input"
            aria-label="New record secret"
            value={draft.secret}
            placeholder="BASE32SECRET"
            onChange={(event) => setDraft((current) => ({ ...current, secret: event.target.value }))}
          />
        </label>
        <Button type="submit" className="add-button" variant="secondary" isIconOnly aria-label="Add">
          <Plus size={18} />
        </Button>
      </form>
    </main>
  );
}
