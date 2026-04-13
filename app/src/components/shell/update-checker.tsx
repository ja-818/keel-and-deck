import { Download, RotateCw } from "lucide-react";
import { useUpdateChecker } from "../../hooks/use-update-checker";

export function UpdateChecker() {
  const { status, relaunch } = useUpdateChecker();

  if (status.state === "idle") return null;

  if (status.state === "available") {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-full bg-gray-950 px-4 py-2 text-sm text-white shadow-lg">
        <span>Houston v{status.version} is available</span>
        <button
          onClick={status.install}
          className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-sm font-medium text-gray-950 transition-colors hover:bg-gray-100"
        >
          <Download className="size-3.5" />
          Update
        </button>
      </div>
    );
  }

  if (status.state === "downloading") {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-full bg-gray-950 px-4 py-2 text-sm text-white shadow-lg">
        <span>Downloading update... {status.progress}%</span>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-white transition-all"
            style={{ width: `${status.progress}%` }}
          />
        </div>
      </div>
    );
  }

  if (status.state === "ready") {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-full bg-gray-950 px-4 py-2 text-sm text-white shadow-lg">
        <span>Update ready</span>
        <button
          onClick={relaunch}
          className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-sm font-medium text-gray-950 transition-colors hover:bg-gray-100"
        >
          <RotateCw className="size-3.5" />
          Restart
        </button>
      </div>
    );
  }

  return null;
}
