import type { SetupState } from '@app/lib/setupGuidance';

interface SetupChecklistProps {
  state: Exclude<SetupState, 'complete'>;
}

export default function SetupChecklist({ state }: SetupChecklistProps) {
  return (
    <ol aria-label="Setup">
      <li aria-current="step">
        Connect a source
        <p>
          {state === 'no-source'
            ? 'None of your providers is a source. Add Radarr or Sonarr.'
            : 'Add Radarr or Sonarr so Warden has media to work with.'}
        </p>
        <a href="/settings">Open settings</a>
      </li>
    </ol>
  );
}
