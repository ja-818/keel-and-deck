import { Button, HoustonAvatar } from "@houston-ai/core";

interface WelcomeScreenProps {
  title: string;
  tagline: string;
  stepsTitle: string;
  steps: string[];
  startLabel: string;
  skipLabel: string;
  onStart: () => void;
  onSkip: () => void;
  experienceLabel: string;
  beginnerLabel: string;
  beginnerDesc: string;
  professionalLabel: string;
  professionalDesc: string;
  experienceLevel: "beginner" | "professional" | null;
  onSelectExperience: (level: "beginner" | "professional") => void;
}

export function WelcomeScreen({
  title,
  tagline,
  stepsTitle,
  steps,
  startLabel,
  skipLabel,
  onStart,
  onSkip,
  experienceLabel,
  beginnerLabel,
  beginnerDesc,
  professionalLabel,
  professionalDesc,
  experienceLevel,
  onSelectExperience,
}: WelcomeScreenProps) {
  const canStart = experienceLevel !== null;

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background px-6 text-foreground">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <HoustonAvatar color="#0d0d0d" diameter={56} />
        <h1 className="text-[28px] font-normal leading-tight">{title}</h1>
        <p className="text-base text-muted-foreground">{tagline}</p>
        <div className="w-full text-left">
          <p className="text-sm font-medium mb-3">{experienceLabel}</p>
          <div className="flex gap-2" role="radiogroup" aria-label={experienceLabel}>
            <button
              role="radio"
              aria-checked={experienceLevel === "beginner"}
              onClick={() => onSelectExperience("beginner")}
              className={`flex-1 flex flex-col items-start gap-1 px-4 py-3 rounded-xl text-sm transition-colors text-left ${
                experienceLevel === "beginner"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground hover:bg-accent border border-black/5"
              }`}
            >
              <span className="font-medium">{beginnerLabel}</span>
              <span className={`text-xs ${experienceLevel === "beginner" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                {beginnerDesc}
              </span>
            </button>
            <button
              role="radio"
              aria-checked={experienceLevel === "professional"}
              onClick={() => onSelectExperience("professional")}
              className={`flex-1 flex flex-col items-start gap-1 px-4 py-3 rounded-xl text-sm transition-colors text-left ${
                experienceLevel === "professional"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground hover:bg-accent border border-black/5"
              }`}
            >
              <span className="font-medium">{professionalLabel}</span>
              <span className={`text-xs ${experienceLevel === "professional" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                {professionalDesc}
              </span>
            </button>
          </div>
        </div>
        <div className="w-full rounded-xl border border-black/5 bg-secondary/40 p-4 text-left">
          <p className="text-sm font-medium">{stepsTitle}</p>
          <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            {steps.map((step, index) => (
              <li key={step} className="flex items-baseline gap-3">
                <span className="w-4 shrink-0 text-xs tabular-nums text-foreground/60">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Button className="rounded-full px-6" onClick={onStart} disabled={!canStart}>
            {startLabel}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onSkip}
            className="rounded-full px-5"
          >
            {skipLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
