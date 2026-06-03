import { useEffect, useState } from "react";
import { IconCheck, IconCloseLg } from "./icons";

// More Filters right-side drawer.
// - "Describe what you're looking for" textarea at the top; on Apply, the
//   text is pushed into the main search input by the page.
// - Experience level multi-select, date posted single-select, company size
//   multi-select, visa checkbox.
// - On Apply, the page receives the selected values and renders them as
//   removable chips in the chip bar. No backend AI yet.

export interface MoreFiltersState {
  describe: string;
  experience: string[];
  datePosted: string;
  companySize: string[];
  visa: boolean;
}

interface MoreFiltersPanelProps {
  open: boolean;
  onClose: () => void;
  onApply: (state: MoreFiltersState) => void;
  initial?: Partial<MoreFiltersState>;
}

const EXP_LEVELS  = ["Internship", "Entry Level", "Mid Level", "Senior", "Lead", "Manager", "Director"];
const DATE_POSTED = ["Any time", "Past 24h", "Past week", "Past month"];
const SIZES       = ["1-10", "11-50", "51-200", "201-500", "500+"];

export function MoreFiltersPanel({
  open,
  onClose,
  onApply,
  initial,
}: MoreFiltersPanelProps) {
  const [describe, setDescribe] = useState(initial?.describe ?? "");
  const [exp, setExp] = useState<string[]>(initial?.experience ?? []);
  const [datePosted, setDatePosted] = useState(initial?.datePosted ?? "Any time");
  const [companySize, setCompanySize] = useState<string[]>(initial?.companySize ?? []);
  const [visa, setVisa] = useState<boolean>(initial?.visa ?? false);

  // Re-seed state when the drawer reopens with new initial values.
  useEffect(() => {
    if (!open) return;
    setDescribe(initial?.describe ?? "");
    setExp(initial?.experience ?? []);
    setDatePosted(initial?.datePosted ?? "Any time");
    setCompanySize(initial?.companySize ?? []);
    setVisa(initial?.visa ?? false);
  }, [open, initial]);

  if (!open) return null;

  function toggle(arr: string[], setArr: (v: string[]) => void, val: string) {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  }

  function clearAll() {
    setDescribe("");
    setExp([]);
    setDatePosted("Any time");
    setCompanySize([]);
    setVisa(false);
  }

  function handleApply() {
    onApply({
      describe: describe.trim(),
      experience: exp,
      datePosted,
      companySize,
      visa,
    });
    onClose();
  }

  return (
    <>
      <div className="jb-overlay light" onClick={onClose} />
      <div className="jb-drawer">
        <div className="jb-drawer-head">
          <h2>More Filters</h2>
          <button className="jb-modal-close" onClick={onClose} type="button">
            <IconCloseLg />
          </button>
        </div>

        <div className="jb-drawer-body">
          <div>
            <p className="jb-drawer-section-title">Describe what you're looking for</p>
            <textarea
              className="jb-drawer-describe"
              placeholder="e.g. early-career data role with mentorship, ideally NYC or remote"
              value={describe}
              onChange={(e) => setDescribe(e.target.value)}
              rows={3}
            />
            <p className="jb-drawer-describe-hint">
              We'll prioritize roles that match this. (Search will use this on Apply.)
            </p>
          </div>

          <div>
            <p className="jb-drawer-section-title">Experience Level</p>
            <div className="jb-drawer-pills">
              {EXP_LEVELS.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`jb-drawer-pill ${exp.includes(v) ? "active" : ""}`}
                  onClick={() => toggle(exp, setExp, v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="jb-drawer-section-title">Date Posted</p>
            <div className="jb-drawer-pills">
              {DATE_POSTED.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`jb-drawer-pill ${datePosted === v ? "active" : ""}`}
                  onClick={() => setDatePosted(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="jb-drawer-section-title">Company Size</p>
            <div className="jb-drawer-pills">
              {SIZES.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`jb-drawer-pill ${companySize.includes(v) ? "active" : ""}`}
                  onClick={() => toggle(companySize, setCompanySize, v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="jb-drawer-section-title">Other</p>
            <label className="jb-drawer-check">
              <span
                className={`jb-drawer-check-box ${visa ? "on" : ""}`}
                onClick={() => setVisa((v) => !v)}
              >
                {visa && <span style={{ color: "white" }}><IconCheck /></span>}
              </span>
              <span className="jb-drawer-check-label">Visa Sponsorship Available</span>
            </label>
          </div>
        </div>

        <div className="jb-drawer-foot">
          <button className="clear" type="button" onClick={clearAll}>
            Clear All
          </button>
          <button className="apply" type="button" onClick={handleApply}>
            Apply Filters
          </button>
        </div>
      </div>
    </>
  );
}
