import { useState } from "react";
import { X } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";

/** Small editor for a list of short strings (covers, excludes, quote sections, package features). */
export default function ChipListEditor({ label, helperText, placeholder, values, onChange, disabled }) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    if (values.includes(value)) {
      setDraft("");
      return;
    }
    onChange([...values, value]);
    setDraft("");
  };

  return (
    <div className="text-sm">
      <span className="mb-1.5 block text-sm font-medium text-gray-700">{label}</span>
      {helperText ? <p className="mb-2 text-xs text-gray-500">{helperText}</p> : null}

      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          disabled={disabled}
        />
        <Button type="button" variant="outline" onClick={add} disabled={disabled || !draft.trim()}>
          Add
        </Button>
      </div>

      {values.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {values.map((value, index) => (
            <li
              key={`${value}-${index}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 py-1 pl-2.5 pr-1.5 text-xs text-gray-700"
            >
              {value}
              <button
                type="button"
                onClick={() => onChange(values.filter((_, i) => i !== index))}
                disabled={disabled}
                className="rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                aria-label={`Remove ${value}`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
