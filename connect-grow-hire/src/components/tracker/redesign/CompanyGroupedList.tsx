import { ProtoContactCard } from "./ProtoContactCard";
import { GroupSection } from "./GroupSection";
import { CompanyLogo } from "@/components/CompanyLogo";
import { type CompanyGroup } from "@/pages/trackerAdapter";

// Companies view: alphabetised company groups, each containing the people
// affiliated with that company. The group-header tile renders a real logo
// via the canonical CompanyLogo (same one My Network uses) so the chain,
// sizing and monogram fallback match across the app.

interface CompanyGroupedListProps {
  groups: CompanyGroup[];
  openCompanies: Record<string, boolean>;
  selectedContactId: string | null;
  // isOpen is passed so the page can flip from "default open" to "user closed"
  // on a single click even when openCompanies has no entry yet for this row.
  onToggleCompany: (company: string, isOpen: boolean) => void;
  onSelectContact: (id: string) => void;
}

export function CompanyGroupedList({
  groups,
  openCompanies,
  selectedContactId,
  onToggleCompany,
  onSelectContact,
}: CompanyGroupedListProps) {
  return (
    <div className="groups-root">
      {groups.map((g, idx) => {
        // First company defaults to open if the page hasn't recorded a state.
        const isOpen = openCompanies[g.company] ?? idx === 0;
        return (
          <GroupSection
            key={g.company}
            label={g.company.toUpperCase()}
            count={g.contacts.length}
            isOpen={isOpen}
            onToggle={() => onToggleCompany(g.company, isOpen)}
            leading={
              <CompanyLogo company={g.company} size={32} rounded={6} />
            }
          >
            {g.contacts.map((c) => (
              <ProtoContactCard
                key={c.id}
                contact={c}
                isSelected={c.id === selectedContactId}
                onSelect={() => onSelectContact(c.id)}
              />
            ))}
          </GroupSection>
        );
      })}
    </div>
  );
}
