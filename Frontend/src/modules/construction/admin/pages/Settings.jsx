import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Info, Save } from "lucide-react";
import { PageHeader, SectionCard } from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import constructionAdminApi from "../services/adminApi";
import { CN_ADMIN_PAGE_CLASS, CN_ADMIN_SELECT_CLASS } from "../utils/adminTheme";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

/** Explains what a setting decides, so an admin is not guessing at consequences. */
function Hint({ children }) {
  return (
    <p className="mt-1.5 flex gap-1.5 text-xs leading-relaxed text-gray-500">
      <Info className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
      <span>{children}</span>
    </p>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {hint ? <Hint>{hint}</Hint> : null}
    </label>
  );
}

function Toggle({ label, checked, onChange, disabled, hint }) {
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={Boolean(checked)}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[#FF6A00] focus:ring-[#FF6A00]/30"
        />
        <span className="text-sm font-medium text-gray-700">{label}</span>
      </label>
      {hint ? <Hint>{hint}</Hint> : null}
    </div>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setSettings(await constructionAdminApi.getSettings());
    } catch (error) {
      toast.error(errorMessage(error, "Could not load settings"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setIn = (section, key, value) => {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...(prev?.[section] || {}), [key]: value },
    }));
  };

  /** Each card saves only its own section — a partial patch never blanks the rest. */
  const saveSection = async (section, label) => {
    setSavingSection(section);
    try {
      const next = await constructionAdminApi.updateSettings({ [section]: settings[section] });
      setSettings(next);
      toast.success(`${label} saved`);
    } catch (error) {
      toast.error(errorMessage(error, `Could not save ${label.toLowerCase()}`));
    } finally {
      setSavingSection(null);
    }
  };

  const SaveButton = ({ section, label }) => (
    <Button
      size="sm"
      isLoading={savingSection === section}
      disabled={Boolean(savingSection) && savingSection !== section}
      onClick={() => saveSection(section, label)}
    >
      <Save className="mr-1.5 h-3.5 w-3.5" /> Save
    </Button>
  );

  if (loading || !settings) {
    return (
      <div className={CN_ADMIN_PAGE_CLASS}>
        <PageHeader eyebrow="Construction" title="Module Settings" />
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />
          ))}
        </div>
      </div>
    );
  }

  const q = settings.quotation || {};
  const st = settings.stages || {};
  const mt = settings.matching || {};
  const cm = settings.commission || {};
  const mn = settings.money || {};
  const cx = settings.cancellation || {};

  return (
    <div className={CN_ADMIN_PAGE_CLASS}>
      <PageHeader
        eyebrow="Construction"
        title="Module Settings"
        description="These settings answer most of the open questions in the requirements document. Change them here rather than asking for a software release."
      />

      {/* ---------- Stages & approval ---------- */}
      <SectionCard
        title="Stages and approval"
        subtitle="How work is broken into paid stages, and who confirms a stage is genuinely done."
        action={<SaveButton section="stages" label="Stage settings" />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Who decides the stages"
            hint="Contractor-proposed suits construction best — a bathroom and a two-floor build do not break down the same way."
          >
            <select
              className={CN_ADMIN_SELECT_CLASS}
              value={st.mode || "contractor_proposed"}
              onChange={(e) => setIn("stages", "mode", e.target.value)}
            >
              <option value="contractor_proposed">Contractor proposes in the quote</option>
              <option value="platform_fixed">Fixed by you, per service type</option>
              <option value="negotiated">Proposed, then negotiated per project</option>
            </select>
          </Field>

          <Field
            label="Who approves a completed stage"
            hint="Customer-only lets a difficult customer withhold a contractor's payment indefinitely. The escalation option keeps the customer in control but stops the abuse."
          >
            <select
              className={CN_ADMIN_SELECT_CLASS}
              value={st.stageApprovalMode || "customer_or_supervisor"}
              onChange={(e) => setIn("stages", "stageApprovalMode", e.target.value)}
            >
              <option value="customer_only">Customer only</option>
              <option value="customer_or_supervisor">Customer, escalating to your supervisor</option>
              <option value="supervisor_required">Your supervisor must approve</option>
            </select>
          </Field>

          <Input
            label="Escalate to supervisor after (days)"
            type="number"
            min={1}
            max={90}
            value={st.approvalEscalationDays ?? 7}
            onChange={(e) => setIn("stages", "approvalEscalationDays", e.target.value)}
          />
          <Input
            label="Auto-approve after (days, 0 = never)"
            type="number"
            min={0}
            max={365}
            value={st.autoApproveAfterDays ?? 0}
            onChange={(e) => setIn("stages", "autoApproveAfterDays", e.target.value)}
          />
        </div>

        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50/70 p-3.5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Guardrails on a contractor's stage plan
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Input
              label="Min stages"
              type="number"
              min={1}
              max={50}
              value={st.minStages ?? 3}
              onChange={(e) => setIn("stages", "minStages", e.target.value)}
            />
            <Input
              label="Max stages"
              type="number"
              min={1}
              max={50}
              value={st.maxStages ?? 12}
              onChange={(e) => setIn("stages", "maxStages", e.target.value)}
            />
            <Input
              label="Max any one stage (%)"
              type="number"
              min={1}
              max={100}
              value={st.maxSingleStagePercent ?? 40}
              onChange={(e) => setIn("stages", "maxSingleStagePercent", e.target.value)}
            />
            <Input
              label="Max first stage (%)"
              type="number"
              min={1}
              max={100}
              value={st.maxFirstStagePercent ?? 20}
              onChange={(e) => setIn("stages", "maxFirstStagePercent", e.target.value)}
            />
          </div>
          <Hint>
            These are what stop a contractor writing &ldquo;70% on mobilisation&rdquo; — the exact
            abuse staged payment exists to prevent.
          </Hint>
        </div>
      </SectionCard>

      {/* ---------- Quotation ---------- */}
      <SectionCard
        title="Quotation format"
        subtitle="What a contractor's quote contains, and how tax is shown on it."
        action={<SaveButton section="quotation" label="Quotation settings" />}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tax treatment" hint="Exclusive is the construction norm — confirm with your accountant.">
            <select
              className={CN_ADMIN_SELECT_CLASS}
              value={q.taxMode || "exclusive"}
              onChange={(e) => setIn("quotation", "taxMode", e.target.value)}
            >
              <option value="exclusive">Shown separately (exclusive)</option>
              <option value="inclusive">Included in the rate</option>
              <option value="none">No tax shown</option>
            </select>
          </Field>
          <Input
            label="Tax label"
            value={q.taxLabel ?? "GST"}
            onChange={(e) => setIn("quotation", "taxLabel", e.target.value)}
          />
          <Input
            label="Default tax %"
            type="number"
            min={0}
            max={100}
            value={q.defaultTaxPercent ?? 18}
            onChange={(e) => setIn("quotation", "defaultTaxPercent", e.target.value)}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            label="Quote valid for (days)"
            type="number"
            min={1}
            max={365}
            value={q.defaultValidityDays ?? 15}
            onChange={(e) => setIn("quotation", "defaultValidityDays", e.target.value)}
          />
          <div className="space-y-3 pt-1">
            <Toggle
              label="Group line items into sections"
              checked={q.sectionsEnabled !== false}
              onChange={(v) => setIn("quotation", "sectionsEnabled", v)}
              hint="Civil, electrical, finishing — makes a long quote readable."
            />
            <Toggle
              label="Require exclusions before a quote can be sent"
              checked={q.requireExclusions !== false}
              onChange={(v) => setIn("quotation", "requireExclusions", v)}
              hint="Nearly every dispute starts with something the customer assumed was included."
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Standard terms" hint="Prefilled into every new quote. Contractors can add to it.">
            <Textarea
              rows={4}
              placeholder="Payment terms, working hours, materials, site access…"
              value={q.standardTerms || ""}
              onChange={(e) => setIn("quotation", "standardTerms", e.target.value)}
            />
          </Field>
          <Field label="Standard exclusions">
            <Textarea
              rows={4}
              placeholder="Items typically not included in any quote"
              value={q.standardExclusions || ""}
              onChange={(e) => setIn("quotation", "standardExclusions", e.target.value)}
            />
          </Field>
        </div>
      </SectionCard>

      {/* ---------- Matching ---------- */}
      <SectionCard
        title="Matching and quoting"
        subtitle="How enquiries reach contractors, and how many may quote."
        action={<SaveButton section="matching" label="Matching settings" />}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="How enquiries are distributed"
            hint="Shortlist means the app suggests a few verified contractors and the customer chooses."
          >
            <select
              className={CN_ADMIN_SELECT_CLASS}
              value={mt.leadDistributionMode || "shortlist"}
              onChange={(e) => setIn("matching", "leadDistributionMode", e.target.value)}
            >
              <option value="shortlist">Shortlist — customer chooses</option>
              <option value="broadcast">Broadcast to all matching contractors</option>
              <option value="round_robin">One at a time, in turn</option>
            </select>
          </Field>
          <Input
            label="Shortlist size"
            type="number"
            min={1}
            max={20}
            value={mt.shortlistSize ?? 5}
            onChange={(e) => setIn("matching", "shortlistSize", e.target.value)}
          />
          <Input
            label="Reassign if no answer in (hours)"
            type="number"
            min={1}
            max={336}
            value={mt.leadResponseHours ?? 24}
            onChange={(e) => setIn("matching", "leadResponseHours", e.target.value)}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="pt-1">
            <Toggle
              label="Let several contractors quote the same enquiry"
              checked={mt.allowMultipleQuotes !== false}
              onChange={(v) => setIn("matching", "allowMultipleQuotes", v)}
              hint="Side-by-side comparison only exists if more than one contractor can quote."
            />
          </div>
          <Input
            label="Max quotes per enquiry"
            type="number"
            min={1}
            max={10}
            value={mt.maxQuotesPerEnquiry ?? 3}
            onChange={(e) => setIn("matching", "maxQuotesPerEnquiry", e.target.value)}
          />
        </div>
        <Hint>
          Uncapped competition means contractors lose most of the site visits they attend and stop
          responding. Three keeps comparison useful without burning your supply side.
        </Hint>
      </SectionCard>

      {/* ---------- Money ---------- */}
      <SectionCard
        title="Money held and released"
        subtitle="Retention after handover, site visit charges, and mid-project scope changes."
        action={<SaveButton section="money" label="Money settings" />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Retention held after handover (%)"
            type="number"
            min={0}
            max={25}
            value={mn.retentionPercent ?? 5}
            onChange={(e) => setIn("money", "retentionPercent", e.target.value)}
          />
          <Input
            label="Defect liability period (days)"
            type="number"
            min={0}
            max={1095}
            value={mn.defectLiabilityDays ?? 90}
            onChange={(e) => setIn("money", "defectLiabilityDays", e.target.value)}
          />
        </div>

        <div className="mt-4 space-y-3">
          <Toggle
            label="Charge for a site visit"
            checked={mn.siteVisitCharged === true}
            onChange={(v) => setIn("money", "siteVisitCharged", v)}
            hint="Recommended off at launch — a charge here is friction at the moment you are still proving the platform works."
          />
          {mn.siteVisitCharged ? (
            <div className="grid gap-4 pl-6 sm:grid-cols-2">
              <Input
                label="Site visit fee (₹)"
                type="number"
                min={1}
                value={mn.siteVisitFee ?? 0}
                onChange={(e) => setIn("money", "siteVisitFee", e.target.value)}
              />
              <div className="pt-6">
                <Toggle
                  label="Refund if the customer rejects the quote"
                  checked={mn.refundSiteVisitIfQuoteRejected !== false}
                  onChange={(v) => setIn("money", "refundSiteVisitIfQuoteRejected", v)}
                />
              </div>
            </div>
          ) : null}

          <Toggle
            label="Allow variation orders"
            checked={mn.variationOrdersEnabled !== false}
            onChange={(v) => setIn("money", "variationOrdersEnabled", v)}
            hint="Without this the agreed price cannot legitimately change, so scope changes get settled off-platform in cash and your project record stops being true."
          />
        </div>
      </SectionCard>

      {/* ---------- Commission ---------- */}
      <SectionCard
        title="Platform commission"
        subtitle="How the platform earns from each project."
        action={<SaveButton section="commission" label="Commission settings" />}
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Model">
            <select
              className={CN_ADMIN_SELECT_CLASS}
              value={cm.model || "percentage"}
              onChange={(e) => setIn("commission", "model", e.target.value)}
            >
              <option value="percentage">Percentage of project value</option>
              <option value="fixed">Fixed fee per project</option>
              <option value="per_lead">Charge per enquiry given</option>
              <option value="subscription">Contractor subscription</option>
              <option value="none">No commission</option>
            </select>
          </Field>
          <Input
            label={cm.model === "percentage" ? "Rate (%)" : "Amount (₹)"}
            type="number"
            min={0}
            value={cm.value ?? 5}
            onChange={(e) => setIn("commission", "value", e.target.value)}
          />
          <Field label="Charged when">
            <select
              className={CN_ADMIN_SELECT_CLASS}
              value={cm.chargedAt || "per_stage"}
              onChange={(e) => setIn("commission", "chargedAt", e.target.value)}
            >
              <option value="per_stage">At each stage release</option>
              <option value="on_acceptance">When the quote is accepted</option>
              <option value="on_completion">On project completion</option>
            </select>
          </Field>
          <Field label="Charged to">
            <select
              className={CN_ADMIN_SELECT_CLASS}
              value={cm.chargedTo || "contractor"}
              onChange={(e) => setIn("commission", "chargedTo", e.target.value)}
            >
              <option value="contractor">Contractor</option>
              <option value="customer">Customer</option>
              <option value="split">Split between both</option>
            </select>
          </Field>
        </div>
      </SectionCard>

      {/* ---------- Cancellation ---------- */}
      <SectionCard
        title="Cancellation"
        subtitle="What happens when a project ends before it is finished."
        action={<SaveButton section="cancellation" label="Cancellation settings" />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Customer notice (days)"
            type="number"
            min={0}
            max={90}
            value={cx.customerNoticeDays ?? 7}
            onChange={(e) => setIn("cancellation", "customerNoticeDays", e.target.value)}
          />
          <Input
            label="Contractor notice (days)"
            type="number"
            min={0}
            max={90}
            value={cx.contractorNoticeDays ?? 15}
            onChange={(e) => setIn("cancellation", "contractorNoticeDays", e.target.value)}
          />
          <Field
            label="How completed work is valued"
            hint="Decides how much of the held money the contractor keeps when a project stops midway."
          >
            <select
              className={CN_ADMIN_SELECT_CLASS}
              value={cx.completedWorkValuation || "approved_stages_only"}
              onChange={(e) => setIn("cancellation", "completedWorkValuation", e.target.value)}
            >
              <option value="approved_stages_only">Approved stages only</option>
              <option value="pro_rata_current_stage">Pro-rata within the current stage</option>
              <option value="admin_assessed">Assessed by your team</option>
            </select>
          </Field>
          <Input
            label="Customer cancellation fee (%)"
            type="number"
            min={0}
            max={25}
            value={cx.customerCancellationFeePercent ?? 0}
            onChange={(e) => setIn("cancellation", "customerCancellationFeePercent", e.target.value)}
          />
        </div>
      </SectionCard>
    </div>
  );
}
