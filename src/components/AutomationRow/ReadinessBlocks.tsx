import Badge from '@app/components/Badge';
import Button from '@app/components/Button';
import type { AutomationReadiness } from '@contract/automations';
import type { ReadinessFinding } from '@contract/readiness';

function Line({
  text,
  detail,
  children,
}: { text: string; detail?: string; children?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-2">
      <p className="min-w-0 flex-1 basis-60 break-words text-sm text-text-primary">
        {text}
        {detail && <span className="block text-xs text-text-secondary">{detail}</span>}
      </p>
      {children}
    </li>
  );
}

/**
 * What stops an automation, and what a user has accepted, listed under its row. A finding
 * awaiting sign-off can be accepted here; one that needs a fix says what clears it.
 */
export default function ReadinessBlocks({
  readiness: { blocks, problems },
  onSignOff,
}: {
  readiness: Pick<AutomationReadiness, 'blocks' | 'problems'>;
  onSignOff?: (findingId: string) => unknown;
}) {
  const needsFix: { id: string; text: string; detail?: string }[] = [
    ...problems.map((text) => ({ id: text, text })),
    ...blocks.needsFix.map((f: ReadinessFinding) => ({
      id: f.id,
      text: f.message,
      detail: f.clears,
    })),
  ];
  if (needsFix.length + blocks.awaitingSignOff.length + blocks.signedOff.length === 0) return null;

  return (
    <div className="mt-3 space-y-3 rounded border border-warning/40 bg-warning/10 px-3 py-2.5">
      {needsFix.length > 0 && (
        <section aria-label="Needs fix" className="space-y-1.5">
          <Badge variant="error" size="sm">
            Needs fix
          </Badge>
          <ul className="space-y-1.5">
            {needsFix.map((line) => (
              <Line key={line.id} text={line.text} detail={line.detail} />
            ))}
          </ul>
        </section>
      )}
      {blocks.awaitingSignOff.length > 0 && (
        <section aria-label="Awaiting sign-off" className="space-y-1.5">
          <Badge variant="warning" size="sm">
            Awaiting sign-off
          </Badge>
          <ul className="space-y-1.5">
            {blocks.awaitingSignOff.map((f) => (
              <Line key={f.id} text={f.message} detail="Its schedule waits until this is accepted.">
                {onSignOff && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => onSignOff(f.id)}
                  >
                    Accept
                  </Button>
                )}
              </Line>
            ))}
          </ul>
        </section>
      )}
      {blocks.signedOff.length > 0 && (
        <section aria-label="Signed off" className="space-y-1.5">
          <Badge variant="default" size="sm">
            Signed off
          </Badge>
          <ul className="space-y-1.5">
            {blocks.signedOff.map((f) => (
              <Line key={f.id} text={f.message} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
