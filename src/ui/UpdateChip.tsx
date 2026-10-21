// A small note at the bottom when a new version of the app is ready. Your data stays where it is.

import { updateNow, useUpdateReady } from "../app/update";

export function UpdateChip() {
  if (!useUpdateReady()) return null;
  return (
    <div className="update-chip" role="status">
      <span>A new version is ready.</span>
      <button className="btn small" onClick={() => void updateNow()}>Update</button>
    </div>
  );
}
