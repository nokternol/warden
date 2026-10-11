import type { SetupState } from '@app/lib/setupGuidance';

interface SetupChecklistProps {
  state: Exclude<SetupState, 'complete'>;
}

export default function SetupChecklist(_props: SetupChecklistProps) {
  return (
    <ol aria-label="Setup">
      <li aria-current="step">
        Connect a source
        <a href="/settings">Open settings</a>
      </li>
    </ol>
  );
}
